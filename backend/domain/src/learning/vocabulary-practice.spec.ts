/** 단어 연습 문항 materialize와 세션·답안 상태 전이를 검증한다 */
import { describe, expect, it } from 'vitest';
import type {
  AnswerVocabularyPracticeInput,
  CreateVocabularyPracticeInput,
  MaterializedPracticeSession,
  PracticeSessionRecord,
  PracticeSourceRecord,
  SubmitPracticeAnswerInput,
  SubmitPracticeAnswerResult,
  VocabularyPracticeRepository,
} from './vocabulary-practice.repository.js';
import {
  VocabularyPracticeService,
  type VocabularyPracticeDependencies,
} from './vocabulary-practice.js';

const now = new Date('2026-07-26T03:00:00.000Z');

const createSource = (count = 10): PracticeSourceRecord => ({
  label: '공용 검색',
  candidates: Array.from({ length: count }, (_, index) => ({
    vocabularyId: `vocabulary-${index + 1}`,
    thai: `태국어-${index + 1}`,
    meaningId: `meaning-${index + 1}`,
    meaningKo: `뜻-${index + 1}`,
    pronunciations: [
      {
        id: `pronunciation-${index + 1}`,
        pronunciationKo: `발음-${index + 1}`,
        toneMarks: 'M',
        mediaAssetId: `media-${index + 1}`,
        storageKey: `practice/audio-${index + 1}.mp3`,
      },
    ],
    card: {
      id: `vocabulary-${index + 1}`,
      thai: `태국어-${index + 1}`,
      kind: 'WORD',
      meanings: [
        {
          id: `meaning-${index + 1}`,
          meaningKo: `뜻-${index + 1}`,
          partOfSpeech: '명사',
          difficulty: 1,
          contextNote: null,
        },
      ],
      pronunciations: [
        {
          id: `pronunciation-${index + 1}`,
          pronunciationKo: `발음-${index + 1}`,
          toneMarks: 'M',
          mediaAssetId: `media-${index + 1}`,
          storageKey: `practice/audio-${index + 1}.mp3`,
        },
      ],
      meaningPronunciations: [
        {
          meaningId: `meaning-${index + 1}`,
          pronunciationId: `pronunciation-${index + 1}`,
        },
      ],
    },
  })),
});

class FakeVocabularyPracticeRepository implements VocabularyPracticeRepository {
  source: PracticeSourceRecord | null = createSource();
  created: MaterializedPracticeSession | null = null;
  session: PracticeSessionRecord | null = null;
  answerResult: SubmitPracticeAnswerResult = { status: 'NOT_FOUND' };
  answerInput: SubmitPracticeAnswerInput | null = null;

  loadSource() {
    return Promise.resolve(this.source);
  }

  createSession(input: MaterializedPracticeSession) {
    this.created = input;
    this.session = {
      ...input,
      status: 'ACTIVE',
      completedAt: null,
      answers: [],
    };
    return Promise.resolve(this.session);
  }

  getSession() {
    return Promise.resolve(this.session);
  }

  submitAnswer(input: SubmitPracticeAnswerInput) {
    this.answerInput = input;
    return Promise.resolve(this.answerResult);
  }
}

const createService = (
  repository: FakeVocabularyPracticeRepository,
  shuffle: VocabularyPracticeDependencies['shuffle'] = (items) => [...items],
) => {
  let nextId = 0;
  return new VocabularyPracticeService({
    repository,
    createId: () => `generated-${++nextId}`,
    now: () => now,
    shuffle,
  });
};

const createInput = (
  overrides: Partial<CreateVocabularyPracticeInput> = {},
): CreateVocabularyPracticeInput => ({
  userId: 'user-1',
  source: {
    type: 'SEARCH_SELECTION',
    vocabularyIds: Array.from(
      { length: 10 },
      (_, index) => `vocabulary-${index + 1}`,
    ),
  },
  modes: ['THAI_TO_MEANING'],
  questionCount: 10,
  order: 'SOURCE',
  ...overrides,
});

describe('VocabularyPracticeService 세션 생성', () => {
  it.each([
    'THAI_TO_MEANING',
    'MEANING_TO_THAI',
    'AUDIO_TO_THAI',
    'AUDIO_TO_MEANING',
  ] as const)('%s를 meaning 단위 4지선다로 만든다', async (mode) => {
    const repository = new FakeVocabularyPracticeRepository();
    const result = await createService(repository).create(
      createInput({ modes: [mode] }),
    );

    expect(result.questions).toHaveLength(10);
    expect(result.questions[0]).toMatchObject({
      vocabularyId: 'vocabulary-1',
      meaningId: 'meaning-1',
      mode,
    });
    expect(result.questions[0]?.options).toHaveLength(4);
    expect(
      new Set(result.questions[0]?.options.map(({ label }) => label)).size,
    ).toBe(4);
  });

  it('여러 방식은 source 순서에 round-robin으로 배정한다', async () => {
    const repository = new FakeVocabularyPracticeRepository();
    const result = await createService(repository).create(
      createInput({
        modes: ['THAI_TO_MEANING', 'AUDIO_TO_MEANING'],
      }),
    );

    expect(result.questions.slice(0, 4).map(({ mode }) => mode)).toEqual([
      'THAI_TO_MEANING',
      'AUDIO_TO_MEANING',
      'THAI_TO_MEANING',
      'AUDIO_TO_MEANING',
    ]);
  });

  it('RANDOM만 source 후보를 한 번 섞어 저장한다', async () => {
    const repository = new FakeVocabularyPracticeRepository();
    const service = createService(repository, (items) => [...items].reverse());

    const result = await service.create(createInput({ order: 'RANDOM' }));

    expect(result.questions[0]?.vocabularyId).toBe('vocabulary-10');
    expect(repository.created?.startedAt).toEqual(now);
  });

  it('후보가 부족하면 문항 수를 줄이지 않는다', async () => {
    const repository = new FakeVocabularyPracticeRepository();
    repository.source = createSource(9);

    await expect(
      createService(repository).create(createInput()),
    ).rejects.toMatchObject({
      code: 'PRACTICE_SOURCE_INSUFFICIENT',
    });
    expect(repository.created).toBeNull();
  });

  it('출처가 없으면 노출 없는 source not found로 변환한다', async () => {
    const repository = new FakeVocabularyPracticeRepository();
    repository.source = null;

    await expect(
      createService(repository).create(createInput()),
    ).rejects.toMatchObject({
      code: 'PRACTICE_SOURCE_NOT_FOUND',
    });
  });
});

describe('VocabularyPracticeService 조회와 답안', () => {
  it('다른 사용자와 없는 세션을 같은 not found로 숨긴다', async () => {
    const repository = new FakeVocabularyPracticeRepository();
    const service = createService(repository);

    await expect(service.get('user-1', 'missing')).rejects.toMatchObject({
      code: 'PRACTICE_SESSION_NOT_FOUND',
    });
  });

  it.each([
    ['NOT_FOUND', 'PRACTICE_SESSION_NOT_FOUND'],
    ['INVALID_OPTION', 'PRACTICE_OPTION_INVALID'],
    ['COMPLETED', 'PRACTICE_SESSION_COMPLETED'],
  ] as const)('%s 답안 상태를 %s 오류로 바꾼다', async (status, code) => {
    const repository = new FakeVocabularyPracticeRepository();
    repository.answerResult = { status };
    const service = createService(repository);
    const input: AnswerVocabularyPracticeInput = {
      userId: 'user-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      clientAnswerId: 'answer-1',
      selectedOptionId: 'option-1',
    };

    await expect(service.answer(input)).rejects.toMatchObject({ code });
    expect(repository.answerInput).toEqual({ ...input, answeredAt: now });
  });
});
