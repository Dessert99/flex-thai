/** 학습자 내부 projection이 서명 URL과 strict 공개 계약으로 바뀌는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  LearnerContentService,
  LearnerPublicResponseError,
} from './learner-content.service.js';

const ids = {
  question: '00000000-0000-4000-8000-000000000001',
  version: '00000000-0000-4000-8000-000000000002',
  type: '00000000-0000-4000-8000-000000000003',
  block: '00000000-0000-4000-8000-000000000004',
  sentence: '00000000-0000-4000-8000-000000000005',
  option: '00000000-0000-4000-8000-000000000006',
  vocabulary: '00000000-0000-4000-8000-000000000007',
  meaning: '00000000-0000-4000-8000-000000000008',
  pronunciation: '00000000-0000-4000-8000-000000000009',
  attempt: '00000000-0000-4000-8000-000000000010',
  clientAttempt: '00000000-0000-4000-8000-000000000011',
  requestedVersion: '00000000-0000-4000-8000-000000000012',
  persistedVersion: '00000000-0000-4000-8000-000000000013',
} as const;

const sentence = {
  sentenceVersionId: ids.sentence,
  originalText: 'สวัสดี',
  translationKo: '안녕하세요',
  pronunciationKo: '싸왓디',
  toneMarks: 'L-L-M',
  media: { storageKey: 'private/shared.mp3' },
  tokens: [
    {
      position: 0,
      surface: 'สวัสดี',
      startOffset: 0,
      endOffset: 6,
      vocabularyId: ids.vocabulary,
      meaningId: ids.meaning,
      pronunciationId: ids.pronunciation,
      contextMeaningKo: '안녕하세요',
      pronunciationKo: '싸왓디',
      toneMarks: 'L-L-M',
      media: { storageKey: 'private/shared.mp3' },
      role: 'TARGET',
    },
  ],
  expressions: [
    {
      startTokenIndex: 0,
      endTokenIndex: 1,
      vocabularyId: ids.vocabulary,
      meaningId: ids.meaning,
      pronunciationId: ids.pronunciation,
      contextMeaningKo: '안녕하세요',
      pronunciationKo: '싸왓디',
      toneMarks: 'L-L-M',
      media: { storageKey: 'private/shared.mp3' },
      representative: true,
    },
  ],
} as const;

const questionType = {
  id: ids.type,
  slug: 'reading-standard-choice',
  displayName: '독해 기본 선택',
} as const;

const page = {
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
} as const;

const dependencies = () => ({
  questionQuery: {
    listQuestions: vi.fn().mockResolvedValue({
      items: [
        {
          questionId: ids.question,
          questionVersionId: ids.version,
          questionType,
          skill: 'READING',
          difficulty: 2,
          saved: false,
          firstResult: 'UNANSWERED',
        },
      ],
      page,
    }),
    getQuestionDetail: vi.fn().mockResolvedValue({
      questionId: ids.question,
      questionVersionId: ids.version,
      questionType,
      skill: 'READING',
      difficulty: 2,
      template: 'STANDARD_CHOICE',
      blocks: [
        {
          id: ids.block,
          kind: 'QUESTION',
          displayMode: 'TEXT_AND_AUDIO',
          position: 0,
          sentences: [{ position: 0, speaker: null, sentence }],
        },
      ],
      options: [{ id: ids.option, position: 0, sentence, span: null }],
      saved: false,
    }),
    getExplanation: vi.fn().mockResolvedValue([
      {
        id: ids.block,
        kind: 'EXPLANATION',
        displayMode: 'TEXT',
        position: 0,
        sentences: [{ position: 0, speaker: null, sentence }],
      },
    ]),
    listAttempts: vi.fn().mockResolvedValue({
      items: [
        {
          id: ids.attempt,
          questionId: ids.question,
          questionVersionId: ids.version,
          attemptNo: 1,
          selectedOptionId: ids.option,
          clientAttemptId: ids.clientAttempt,
          durationMs: 1_000,
          isCorrect: true,
          submittedAt: new Date('2026-07-24T00:00:00.000Z'),
        },
      ],
      page,
    }),
  },
  vocabularyQuery: {
    listVocabularies: vi.fn().mockResolvedValue({
      items: [
        {
          id: ids.vocabulary,
          thai: 'สวัสดี',
          kind: 'WORD',
          meanings: [
            {
              id: ids.meaning,
              meaningKo: '안녕하세요',
              partOfSpeech: '감탄사',
              difficulty: 1,
              contextNote: null,
            },
          ],
          pronunciations: [
            {
              id: ids.pronunciation,
              pronunciationKo: '싸왓디',
              toneMarks: 'L-L-M',
              media: { storageKey: 'private/shared.mp3' },
            },
          ],
          audioEligibleMeaningCount: 1,
          saved: true,
        },
      ],
      page,
    }),
    getVocabularyDetail: vi.fn().mockResolvedValue({
      id: ids.vocabulary,
      thai: 'สวัสดี',
      kind: 'WORD',
      meanings: [
        {
          id: ids.meaning,
          meaningKo: '안녕하세요',
          partOfSpeech: '감탄사',
          difficulty: 1,
          contextNote: null,
        },
      ],
      pronunciations: [
        {
          id: ids.pronunciation,
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          media: { storageKey: 'private/shared.mp3' },
        },
      ],
      audioEligibleMeaningCount: 1,
      saved: true,
      meaningPronunciations: [
        { meaningId: ids.meaning, pronunciationId: ids.pronunciation },
      ],
      relations: [
        {
          id: '00000000-0000-4000-8000-000000000099',
          type: 'SYNONYM',
          direction: 'BIDIRECTIONAL',
          meaningId: ids.meaning,
          relatedVocabularyId: '00000000-0000-4000-8000-000000000098',
          relatedThai: 'หวัดดี',
          relatedMeaningId: '00000000-0000-4000-8000-000000000097',
          relatedMeaningKo: '안녕',
        },
      ],
      exampleSentences: [
        {
          sentenceVersionId: ids.sentence,
          originalText: 'เขาพูดว่าสวัสดี',
          translationKo: '그는 안녕하세요라고 말했다',
          pronunciationKo: '카오 풋 와 싸왓디',
          toneMarks: 'R-F-F-L-L-M',
          media: { storageKey: 'private/shared.mp3' },
          tokens: sentence.tokens,
          expressions: sentence.expressions,
        },
      ],
    }),
    listRelatedQuestions: vi.fn().mockResolvedValue({
      items: [
        {
          questionId: ids.question,
          questionVersionId: ids.version,
          questionType,
          skill: 'READING',
          difficulty: 2,
          saved: false,
          firstResult: 'UNANSWERED',
        },
      ],
      page,
    }),
  },
  questionAttempts: {
    submit: vi.fn().mockResolvedValue({
      attempt: {
        id: ids.attempt,
        userId: 'user-1',
        questionId: ids.question,
        questionVersionId: ids.persistedVersion,
        attemptNo: 1,
        selectedOptionId: ids.option,
        clientAttemptId: ids.clientAttempt,
        durationMs: 1_000,
        isCorrect: true,
        submittedAt: new Date('2026-07-24T00:00:00.000Z'),
      },
      feedback: { correctOptionId: ids.option },
    }),
  },
  savedContent: {
    saveQuestion: vi.fn().mockResolvedValue(undefined),
    removeQuestion: vi.fn().mockResolvedValue(undefined),
  },
  mediaReadUrls: {
    createReadUrl: vi
      .fn()
      .mockResolvedValue('https://media.example.com/signed'),
  },
});

describe('LearnerContentService 문제 응답', () => {
  it('한 응답에서 같은 storage key를 한 번만 5분 URL로 서명한다', async () => {
    const fakes = dependencies();
    const service = new LearnerContentService({
      ...fakes,
      now: () => new Date('2026-07-24T00:00:00.000Z'),
    });

    const result = await service.getQuestionDetail('user-1', ids.question);

    expect(fakes.mediaReadUrls.createReadUrl).toHaveBeenCalledTimes(1);
    expect(fakes.mediaReadUrls.createReadUrl).toHaveBeenCalledWith(
      'private/shared.mp3',
      new Date('2026-07-24T00:05:00.000Z'),
    );
    expect(result.blocks[0]?.sentences[0]?.sentence.audioUrl).toBe(
      'https://media.example.com/signed',
    );
    expect(result.options[0]?.sentence?.audioUrl).toBe(
      'https://media.example.com/signed',
    );
    expect(result.blocks[0]?.sentences[0]?.sentence.tokens[0]?.audioUrl).toBe(
      'https://media.example.com/signed',
    );
    expect(
      result.blocks[0]?.sentences[0]?.sentence.expressions[0]?.audioUrl,
    ).toBe('https://media.example.com/signed');
    expect(JSON.stringify(result)).not.toContain('storageKey');
    expect(JSON.stringify(result)).not.toContain('EXPLANATION');
    expect(JSON.stringify(result)).not.toContain('isCorrect');
  });

  it('답안 결과의 historical version 해설과 ISO 제출 시각만 제출 뒤 합친다', async () => {
    const fakes = dependencies();
    const service = new LearnerContentService({
      ...fakes,
      now: () => new Date('2026-07-24T00:00:00.000Z'),
    });

    const result = await service.submitQuestionAttempt('user-1', ids.question, {
      questionVersionId: ids.requestedVersion,
      selectedOptionId: ids.option,
      clientAttemptId: ids.clientAttempt,
      durationMs: 1_000,
    });

    expect(fakes.questionQuery.getExplanation).toHaveBeenCalledWith(
      ids.persistedVersion,
    );
    expect(result).toMatchObject({
      attempt: {
        id: ids.attempt,
        attemptNo: 1,
        isFirst: true,
        submittedAt: '2026-07-24T00:00:00.000Z',
      },
      feedback: {
        correctOptionId: ids.option,
        explanationBlocks: [{ kind: 'EXPLANATION' }],
      },
    });
  });

  it('공개 문제 query의 null을 안정적인 404 code로 바꾼다', async () => {
    const fakes = dependencies();
    fakes.questionQuery.getQuestionDetail.mockResolvedValueOnce(null);
    const service = new LearnerContentService({ ...fakes });

    await expect(
      service.getQuestionDetail('user-1', ids.question),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'QUESTION_NOT_FOUND' },
    });
  });

  it('공개 응답 계약 실패를 request ZodError와 다른 generic 오류로 바꾼다', async () => {
    const fakes = dependencies();
    fakes.questionQuery.listQuestions.mockResolvedValueOnce({
      items: [],
      page: { ...page, totalItems: 0, totalPages: 0 },
      storageKey: 'private/leak.mp3',
    });
    const service = new LearnerContentService({ ...fakes });

    await expect(
      service.listQuestions('user-1', { page: 1, pageSize: 20 }),
    ).rejects.toEqual(new LearnerPublicResponseError());
  });
});

describe('LearnerContentService 어휘 응답', () => {
  it('발음과 예문의 같은 media key를 한 번만 서명하고 내부 key를 제거한다', async () => {
    const fakes = dependencies();
    const service = new LearnerContentService({
      ...fakes,
      now: () => new Date('2026-07-24T00:00:00.000Z'),
    });

    const result = await service.getVocabularyDetail('user-1', ids.vocabulary);

    expect(fakes.mediaReadUrls.createReadUrl).toHaveBeenCalledTimes(1);
    expect(result.pronunciations[0]?.audioUrl).toBe(
      'https://media.example.com/signed',
    );
    expect(result.exampleSentences[0]?.audioUrl).toBe(
      'https://media.example.com/signed',
    );
    expect(result.relations[0]?.relatedMeaningKo).toBe('안녕');
    expect(JSON.stringify(result)).not.toContain('storageKey');
  });

  it('관련 문제에서도 비공개 어휘를 404로 숨긴다', async () => {
    const fakes = dependencies();
    fakes.vocabularyQuery.getVocabularyDetail.mockResolvedValueOnce(null);
    const service = new LearnerContentService({ ...fakes });

    await expect(
      service.listRelatedQuestions('user-1', ids.vocabulary, {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'VOCABULARY_NOT_FOUND' },
    });
    expect(fakes.vocabularyQuery.listRelatedQuestions).not.toHaveBeenCalled();
  });

  it('어휘 상세 query의 null도 같은 stable 404 code로 바꾼다', async () => {
    const fakes = dependencies();
    fakes.vocabularyQuery.getVocabularyDetail.mockResolvedValueOnce(null);
    const service = new LearnerContentService({ ...fakes });

    await expect(
      service.getVocabularyDetail('user-1', ids.vocabulary),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'VOCABULARY_NOT_FOUND' },
    });
  });

  it('목록·풀이 기록·문제 저장 변경의 사용자와 strict 공개 값을 전달한다', async () => {
    const fakes = dependencies();
    const service = new LearnerContentService({ ...fakes });

    const questions = await service.listQuestions('user-1', {
      page: 1,
      pageSize: 20,
    });
    const attempts = await service.listAttempts('user-1', {
      page: 1,
      pageSize: 20,
    });
    const vocabularies = await service.listVocabularies('user-1', {
      page: 1,
      pageSize: 20,
    });
    const related = await service.listRelatedQuestions(
      'user-1',
      ids.vocabulary,
      { page: 1, pageSize: 20 },
    );
    await service.saveQuestion('user-1', ids.question);
    await service.removeQuestion('user-1', ids.question);

    expect(questions.items).toHaveLength(1);
    expect(attempts.items[0]?.submittedAt).toBe('2026-07-24T00:00:00.000Z');
    expect(vocabularies.items[0]?.pronunciations[0]?.audioUrl).toBe(
      'https://media.example.com/signed',
    );
    expect(vocabularies.items[0]?.audioEligibleMeaningCount).toBe(1);
    expect(related.items).toHaveLength(1);
    expect(fakes.savedContent.saveQuestion).toHaveBeenCalledWith(
      'user-1',
      ids.question,
      expect.any(Date),
    );
    expect(fakes.savedContent.removeQuestion).toHaveBeenCalledWith(
      'user-1',
      ids.question,
    );
  });
});
