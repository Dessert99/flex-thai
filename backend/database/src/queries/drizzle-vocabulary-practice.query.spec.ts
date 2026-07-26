/** 단어 연습 source 소유권·공개 음성 조건과 세션 진행 복구 조회를 검증한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { DrizzleVocabularyPracticeQuery } from './drizzle-vocabulary-practice.query.js';

const candidateRow = {
  vocabularyId: 'vocabulary-1',
  thai: 'เรียน',
  meaningId: 'meaning-1',
  meaningKo: '배우다',
  pronunciations: [
    {
      id: 'pronunciation-1',
      pronunciationKo: '리안',
      toneMarks: 'M',
      mediaAssetId: 'media-1',
      storageKey: 'practice/learn.mp3',
    },
  ],
  card: {
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

const createDatabase = (results: Array<Array<Record<string, unknown>>>) => {
  const queries: unknown[] = [];
  return {
    database: {
      execute(query: unknown) {
        queries.push(query);
        return Promise.resolve({ rows: results.shift() ?? [] });
      },
    },
    queries,
  };
};

const toSql = (query: unknown) =>
  new PgDialect().sqlToQuery(query as never).sql.toLowerCase();

describe('DrizzleVocabularyPracticeQuery source 조회', () => {
  it('검색 ID 순서와 PUBLISHED·어휘 단위 READY 조건을 query에 고정한다', async () => {
    const fake = createDatabase([[candidateRow]]);
    const query = new DrizzleVocabularyPracticeQuery(fake.database);

    await expect(
      query.loadSearchSelection('user-1', ['vocabulary-1']),
    ).resolves.toEqual({
      label: '공용 검색',
      candidates: [candidateRow],
    });

    const sqlText = toSql(fake.queries[0]);
    expect(sqlText).toContain('published');
    expect(sqlText).toContain('ready');
    expect(sqlText).toContain('vocabulary_meaning_pronunciations');
    expect(sqlText).toContain('array_position');
    expect(sqlText).toContain('ep.vocabulary_id = v.id');
    expect(sqlText).not.toContain('where emp.meaning_id = m.id');
  });

  it('단어장은 사용자 소유권을 먼저 확인하고 added_at 순서를 사용한다', async () => {
    const fake = createDatabase([[{ name: 'FLEX 어휘' }], [candidateRow]]);
    const query = new DrizzleVocabularyPracticeQuery(fake.database);

    await expect(query.loadWordbook('user-1', 'wordbook-1')).resolves.toEqual({
      label: 'FLEX 어휘',
      candidates: [candidateRow],
    });

    expect(toSql(fake.queries[0])).toContain('user_id');
    expect(toSql(fake.queries[1])).toContain('added_at');
  });

  it('소유 단어장이 없으면 source 후보를 조회하지 않는다', async () => {
    const fake = createDatabase([[]]);
    const query = new DrizzleVocabularyPracticeQuery(fake.database);

    await expect(query.loadWordbook('user-1', 'missing')).resolves.toBeNull();
    expect(fake.queries).toHaveLength(1);
  });
});

describe('DrizzleVocabularyPracticeQuery 세션 조회', () => {
  it('문항과 원시 답안을 record로 복원해 답변 진행을 잃지 않는다', async () => {
    const fake = createDatabase([
      [
        {
          id: 'session-1',
          userId: 'user-1',
          sourceType: 'SEARCH_SELECTION',
          sourceWordbookId: null,
          sourceLabel: '공용 검색',
          modes: ['THAI_TO_MEANING'],
          requestedQuestionCount: 10,
          questionOrder: 'SOURCE',
          status: 'ACTIVE',
          questionCount: 1,
          startedAt: new Date('2026-07-26T00:00:00.000Z'),
          completedAt: null,
        },
      ],
      [
        {
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
          cardSnapshot: candidateRow.card,
        },
      ],
      [
        {
          id: 'answer-1',
          sessionId: 'session-1',
          questionId: 'question-1',
          userId: 'user-1',
          clientAnswerId: 'client-1',
          selectedOptionId: 'option-1',
          selectedLabelSnapshot: '배우다',
          isCorrect: true,
          answeredAt: new Date('2026-07-26T00:01:00.000Z'),
        },
      ],
    ]);
    const query = new DrizzleVocabularyPracticeQuery(fake.database);

    const session = await query.getSession('user-1', 'session-1');

    expect(session?.answers.map(({ questionId }) => questionId)).toEqual([
      'question-1',
    ]);
    expect(session?.questions[0]?.prompt).toEqual({
      type: 'TEXT',
      text: 'เรียน',
    });
  });
});
