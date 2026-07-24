/** 학습자 문제 API의 입력 검증과 정답 비노출 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  pageMetadataSchema,
  questionAttemptListQuerySchema,
  questionAttemptListResponseSchema,
  questionDetailResponseSchema,
  questionIdPathSchema,
  questionListQuerySchema,
  questionListResponseSchema,
  submitQuestionAttemptRequestSchema,
  submitQuestionAttemptResponseSchema,
} from './questions.js';

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
} as const;

const sentence = {
  sentenceVersionId: ids.sentence,
  originalText: 'สวัสดี',
  translationKo: '안녕하세요',
  pronunciationKo: '싸왓디',
  toneMarks: 'L-L-M',
  audioUrl: 'https://media.example.com/sentences/greeting.mp3?Expires=300',
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
      role: 'TARGET',
    },
  ],
  expressions: [],
} as const;

const questionType = {
  id: ids.type,
  slug: 'reading-standard-choice',
  displayName: '독해 기본 선택',
} as const;

const listItem = {
  questionId: ids.question,
  questionVersionId: ids.version,
  questionType,
  skill: 'READING',
  difficulty: 3,
  saved: false,
  firstResult: 'UNANSWERED',
} as const;

const detail = {
  questionId: ids.question,
  questionVersionId: ids.version,
  questionType,
  skill: 'READING',
  difficulty: 3,
  template: 'STANDARD_CHOICE',
  blocks: [
    {
      id: ids.block,
      kind: 'QUESTION',
      displayMode: 'TEXT',
      position: 0,
      sentences: [{ position: 0, speaker: null, sentence }],
    },
  ],
  options: [{ id: ids.option, position: 0, sentence }],
  saved: false,
} as const;

describe('학습자 문제 query와 path 계약', () => {
  it('HTTP query 문자열을 안전한 필터와 페이지 값으로 변환한다', () => {
    expect(
      questionListQuerySchema.parse({
        skill: 'READING',
        questionTypeId: ids.type,
        difficulty: '3',
        saved: 'false',
        firstResult: 'UNANSWERED',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      skill: 'READING',
      questionTypeId: ids.type,
      difficulty: 3,
      saved: false,
      firstResult: 'UNANSWERED',
      page: 2,
      pageSize: 50,
    });
    expect(questionListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('false 외의 임의 문자열을 boolean true로 변환하지 않는다', () => {
    expect(() => questionListQuerySchema.parse({ saved: '0' })).toThrow();
    expect(() => questionListQuerySchema.parse({ saved: 'False' })).toThrow();
  });

  it('범위를 벗어난 페이지·난이도와 알려지지 않은 query를 거부한다', () => {
    expect(() => questionListQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => questionListQuerySchema.parse({ pageSize: '101' })).toThrow();
    expect(() => questionListQuerySchema.parse({ difficulty: '6' })).toThrow();
    expect(() =>
      questionListQuerySchema.parse({ unpublished: 'true' }),
    ).toThrow();
  });

  it('풀이 기록 query와 문제 path는 strict UUID 계약을 따른다', () => {
    expect(questionAttemptListQuerySchema.parse({ page: '3' })).toEqual({
      page: 3,
      pageSize: 20,
    });
    expect(questionIdPathSchema.parse({ questionId: ids.question })).toEqual({
      questionId: ids.question,
    });
    expect(() =>
      questionIdPathSchema.parse({ questionId: 'not-a-uuid' }),
    ).toThrow();
    expect(() =>
      questionIdPathSchema.parse({
        questionId: ids.question,
        versionId: ids.version,
      }),
    ).toThrow();
  });
});

describe('학습자 문제 공개 응답 계약', () => {
  it('문제 목록과 공통 페이지 metadata를 검증한다', () => {
    expect(
      questionListResponseSchema.parse({
        items: [listItem],
        page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      }),
    ).toEqual({
      items: [listItem],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(() =>
      pageMetadataSchema.parse({
        page: 1,
        pageSize: 20,
        totalItems: -1,
        totalPages: 0,
      }),
    ).toThrow();
  });

  it('문제 상세는 공개 블록·선택지·문장 피드백과 서명 URL만 허용한다', () => {
    expect(questionDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it('문제 목록에서 정답과 내부 검증 결과를 거부한다', () => {
    for (const field of [
      'isCorrect',
      'correctOptionId',
      'validationStatus',
      'validationIssues',
      'storageKey',
    ]) {
      expect(() =>
        questionListResponseSchema.parse({
          items: [{ ...listItem, [field]: field }],
          page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        }),
      ).toThrow();
    }
  });

  it('문제 상세에서 정답·검증·storage key·제출 전 해설을 거부한다', () => {
    expect(() =>
      questionDetailResponseSchema.parse({
        ...detail,
        validationStatus: 'PASSED',
      }),
    ).toThrow();
    expect(() =>
      questionDetailResponseSchema.parse({
        ...detail,
        validationIssues: [],
      }),
    ).toThrow();
    expect(() =>
      questionDetailResponseSchema.parse({
        ...detail,
        correctOptionId: ids.option,
      }),
    ).toThrow();
    expect(() =>
      questionDetailResponseSchema.parse({
        ...detail,
        options: [{ ...detail.options[0], isCorrect: true }],
      }),
    ).toThrow();
    expect(() =>
      questionDetailResponseSchema.parse({
        ...detail,
        blocks: [
          {
            ...detail.blocks[0],
            sentences: [
              {
                ...detail.blocks[0].sentences[0],
                sentence: {
                  ...sentence,
                  storageKey: 'private/sentences/greeting.mp3',
                },
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      questionDetailResponseSchema.parse({
        ...detail,
        blocks: [{ ...detail.blocks[0], kind: 'EXPLANATION' }],
      }),
    ).toThrow();
  });
});

describe('학습자 답안 계약', () => {
  it('UUID와 nonnegative safe duration을 가진 strict 요청만 허용한다', () => {
    const request = {
      questionVersionId: ids.version,
      selectedOptionId: ids.option,
      clientAttemptId: ids.clientAttempt,
      durationMs: 18_400,
    };
    expect(submitQuestionAttemptRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      submitQuestionAttemptRequestSchema.parse({
        ...request,
        durationMs: -1,
      }),
    ).toThrow();
    expect(() =>
      submitQuestionAttemptRequestSchema.parse({
        ...request,
        durationMs: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow();
    expect(() =>
      submitQuestionAttemptRequestSchema.parse({
        ...request,
        userId: ids.question,
      }),
    ).toThrow();
  });

  it('답안 응답에서만 정답 ID와 해설 블록을 허용한다', () => {
    const response = {
      attempt: {
        id: ids.attempt,
        attemptNo: 1,
        isFirst: true,
        isCorrect: false,
        selectedOptionId: ids.option,
        submittedAt: '2026-07-23T00:00:00.000Z',
      },
      feedback: {
        correctOptionId: ids.option,
        explanationBlocks: [
          {
            id: ids.block,
            kind: 'EXPLANATION',
            displayMode: 'TEXT',
            position: 0,
            sentences: [{ position: 0, speaker: null, sentence }],
          },
        ],
      },
    };
    expect(submitQuestionAttemptResponseSchema.parse(response)).toEqual(
      response,
    );
  });

  it('현재 버전 상태 없이 무효화된 버전의 원시 기록도 표현한다', () => {
    const response = {
      items: [
        {
          id: ids.attempt,
          questionId: ids.question,
          questionVersionId: ids.version,
          attemptNo: 2,
          selectedOptionId: ids.option,
          clientAttemptId: ids.clientAttempt,
          durationMs: 18_400,
          isCorrect: false,
          submittedAt: '2026-07-23T00:00:00.000Z',
        },
      ],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    };
    expect(questionAttemptListResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      questionAttemptListResponseSchema.parse({
        ...response,
        items: [{ ...response.items[0], versionStatus: 'INVALIDATED' }],
      }),
    ).toThrow();
  });
});
