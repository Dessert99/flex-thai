/** 단어 연습 세션 저장과 답안 lock·멱등·중복 상태 transaction을 검증한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { DrizzleVocabularyPracticeRepository } from './drizzle-vocabulary-practice.repository.js';

const questionRow = {
  id: 'question-1',
  sessionId: 'session-1',
  position: 1,
  vocabularyId: 'vocabulary-1',
  meaningId: 'meaning-1',
  pronunciationId: null,
  mediaAssetId: null,
  mode: 'THAI_TO_MEANING',
  promptText: 'เรียน',
  audioStorageKey: null,
  options: [
    { id: 'option-1', label: '배우다' },
    { id: 'option-2', label: '가르치다' },
    { id: 'option-3', label: '읽다' },
    { id: 'option-4', label: '쓰다' },
  ],
  correctOptionId: 'option-1',
  cardSnapshot: {
    id: 'vocabulary-1',
    thai: 'เรียน',
    kind: 'WORD',
    meanings: [
      {
        id: 'meaning-1',
        meaningKo: '배우다',
        partOfSpeech: '동사',
        difficulty: 1,
        contextNote: null,
      },
    ],
    pronunciations: [
      {
        id: 'pronunciation-1',
        pronunciationKo: '리안',
        toneMarks: 'M',
        mediaAssetId: 'media-1',
        storageKey: 'practice/learn.mp3',
      },
    ],
    meaningPronunciations: [
      { meaningId: 'meaning-1', pronunciationId: 'pronunciation-1' },
    ],
  },
};

const answerRow = {
  id: 'answer-1',
  sessionId: 'session-1',
  questionId: 'question-1',
  userId: 'user-1',
  clientAnswerId: 'client-1',
  selectedOptionId: 'option-1',
  selectedLabelSnapshot: '배우다',
  isCorrect: true,
  answeredAt: new Date('2026-07-26T00:01:00.000Z'),
};

const input = {
  userId: 'user-1',
  sessionId: 'session-1',
  questionId: 'question-1',
  clientAnswerId: 'client-1',
  selectedOptionId: 'option-1',
  answeredAt: answerRow.answeredAt,
};

const replayRow = {
  ...questionRow,
  answerId: answerRow.id,
  answerSessionId: answerRow.sessionId,
  answerQuestionId: answerRow.questionId,
  answerUserId: answerRow.userId,
  answerClientAnswerId: answerRow.clientAnswerId,
  answerSelectedOptionId: answerRow.selectedOptionId,
  answerSelectedLabelSnapshot: answerRow.selectedLabelSnapshot,
  answerIsCorrect: answerRow.isCorrect,
  answerAnsweredAt: answerRow.answeredAt,
  status: 'ACTIVE',
};

const createDatabase = (results: Array<Array<Record<string, unknown>>>) => {
  const events: string[] = [];
  const queries: unknown[] = [];
  const session = {
    execute: (query: unknown) => {
      events.push('execute');
      queries.push(query);
      return Promise.resolve({ rows: results.shift() ?? [] });
    },
  };
  return {
    database: {
      execute: (query: unknown) => session.execute(query),
      transaction<T>(work: (transaction: typeof session) => Promise<T>) {
        events.push('transaction');
        return work(session);
      },
    },
    events,
    queries,
  };
};

describe('DrizzleVocabularyPracticeRepository 답안 transaction', () => {
  it('같은 clientAnswerId와 같은 payload는 기존 feedback을 반환한다', async () => {
    const fake = createDatabase([[], [replayRow]]);
    const repository = new DrizzleVocabularyPracticeRepository(
      fake.database,
      undefined,
      () => 'new-answer',
    );

    await expect(repository.submitAnswer(input)).resolves.toMatchObject({
      status: 'ANSWERED',
      answer: answerRow,
      sessionCompleted: false,
    });
    expect(fake.events).toEqual(['transaction', 'execute', 'execute']);
    expect(new PgDialect().sqlToQuery(fake.queries[0] as never).sql).toContain(
      'pg_advisory_xact_lock',
    );
  });

  it('같은 clientAnswerId의 session·question·option이 다르면 충돌한다', async () => {
    const fake = createDatabase([
      [],
      [
        {
          ...replayRow,
          answerSessionId: 'other-session',
        },
      ],
    ]);
    const repository = new DrizzleVocabularyPracticeRepository(fake.database);

    await expect(repository.submitAnswer(input)).resolves.toEqual({
      status: 'IDEMPOTENCY_CONFLICT',
    });
    expect(fake.events).toEqual(['transaction', 'execute', 'execute']);
  });

  it('다른 client로 이미 답한 문항은 안정적인 중복 상태를 반환한다', async () => {
    const fake = createDatabase([
      [],
      [],
      [{ ...questionRow, status: 'ACTIVE', questionCount: 10 }],
      [{ id: 'existing-answer' }],
    ]);
    const repository = new DrizzleVocabularyPracticeRepository(fake.database);

    await expect(repository.submitAnswer(input)).resolves.toEqual({
      status: 'ALREADY_ANSWERED',
    });
  });

  it('새 마지막 답은 lock 뒤 원시 답을 insert하고 세션을 완료한다', async () => {
    const fake = createDatabase([
      [],
      [],
      [{ ...questionRow, status: 'ACTIVE', questionCount: 1 }],
      [],
      [],
      [{ answerCount: 1 }],
      [],
    ]);
    const repository = new DrizzleVocabularyPracticeRepository(
      fake.database,
      undefined,
      () => answerRow.id,
    );

    await expect(repository.submitAnswer(input)).resolves.toMatchObject({
      status: 'ANSWERED',
      answer: answerRow,
      sessionCompleted: true,
    });
    expect(fake.events).toEqual([
      'transaction',
      'execute',
      'execute',
      'execute',
      'execute',
      'execute',
      'execute',
      'execute',
    ]);
  });

  it('snapshot에 없는 option은 insert 전에 거부한다', async () => {
    const fake = createDatabase([
      [],
      [],
      [{ ...questionRow, status: 'ACTIVE', questionCount: 10 }],
      [],
    ]);
    const repository = new DrizzleVocabularyPracticeRepository(fake.database);

    await expect(
      repository.submitAnswer({ ...input, selectedOptionId: 'missing-option' }),
    ).resolves.toEqual({ status: 'INVALID_OPTION' });
    expect(fake.events).toHaveLength(5);
  });
});
