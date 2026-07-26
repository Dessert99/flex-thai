/** 학습자 어휘 API의 검색·상세·저장 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  savedVocabularyListQuerySchema,
  savedVocabularyListResponseSchema,
  vocabularyDetailResponseSchema,
  vocabularyIdPathSchema,
  vocabularyListQuerySchema,
  vocabularyListResponseSchema,
  vocabularyRelatedQuestionsQuerySchema,
  vocabularyRelatedQuestionsResponseSchema,
} from './vocabularies.js';

const ids = {
  vocabulary: '00000000-0000-4000-8000-000000000021',
  meaning: '00000000-0000-4000-8000-000000000022',
  pronunciation: '00000000-0000-4000-8000-000000000023',
  sentence: '00000000-0000-4000-8000-000000000024',
  question: '00000000-0000-4000-8000-000000000025',
  version: '00000000-0000-4000-8000-000000000026',
  type: '00000000-0000-4000-8000-000000000027',
  secondMeaning: '00000000-0000-4000-8000-000000000028',
  secondPronunciation: '00000000-0000-4000-8000-000000000029',
  dangling: '00000000-0000-4000-8000-000000000030',
} as const;

const vocabulary = {
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
      audioUrl:
        'https://media.example.com/vocabularies/greeting.mp3?Expires=300',
    },
  ],
  saved: true,
} as const;

const page = {
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
} as const;

describe('학습자 어휘 query와 path 계약', () => {
  it('검색 필터와 HTTP 페이지 문자열을 공개 값으로 변환한다', () => {
    expect(
      vocabularyListQuerySchema.parse({
        query: ' สวัสดี ',
        kind: 'WORD',
        partOfSpeech: '감탄사',
        difficulty: '1',
        page: '2',
        pageSize: '30',
      }),
    ).toEqual({
      query: 'สวัสดี',
      kind: 'WORD',
      partOfSpeech: '감탄사',
      difficulty: 1,
      page: 2,
      pageSize: 30,
    });
    expect(vocabularyListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('잘못된 난이도·페이지·알 수 없는 query를 거부한다', () => {
    expect(() =>
      vocabularyListQuerySchema.parse({ difficulty: '0' }),
    ).toThrow();
    expect(() => vocabularyListQuerySchema.parse({ page: '1.5' })).toThrow();
    expect(() => vocabularyListQuerySchema.parse({ pageSize: '0' })).toThrow();
    expect(() =>
      vocabularyListQuerySchema.parse({ status: 'PUBLISHED' }),
    ).toThrow();
  });

  it('관련 문제와 저장 목록은 페이지 query만 받고 path는 UUID만 받는다', () => {
    expect(vocabularyRelatedQuestionsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(savedVocabularyListQuerySchema.parse({ pageSize: '100' })).toEqual({
      page: 1,
      pageSize: 100,
    });
    expect(
      vocabularyIdPathSchema.parse({ vocabularyId: ids.vocabulary }),
    ).toEqual({ vocabularyId: ids.vocabulary });
    expect(() =>
      savedVocabularyListQuerySchema.parse({ query: 'สวัสดี' }),
    ).toThrow();
    expect(() =>
      vocabularyIdPathSchema.parse({ vocabularyId: 'invalid' }),
    ).toThrow();
  });
});

describe('학습자 어휘 공개 응답 계약', () => {
  it('뜻과 발음 음성 URL을 포함한 공용 어휘 목록을 허용한다', () => {
    expect(
      vocabularyListResponseSchema.parse({ items: [vocabulary], page }),
    ).toEqual({ items: [vocabulary], page });
  });

  it('어휘 상세에 게시 문장의 공개 예문을 허용한다', () => {
    const detail = {
      ...vocabulary,
      meaningPronunciations: [
        { meaningId: ids.meaning, pronunciationId: ids.pronunciation },
      ],
      exampleSentences: [
        {
          sentenceVersionId: ids.sentence,
          originalText: 'เขาพูดว่าสวัสดี',
          translationKo: '그는 안녕하세요라고 말했다',
          pronunciationKo: '카오 풋 와 싸왓디',
          toneMarks: 'R-F-F-L-L-M',
          audioUrl:
            'https://media.example.com/sentences/example.mp3?Expires=300',
          tokens: [],
          expressions: [],
        },
      ],
    };
    expect(vocabularyDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it('뜻 2개와 발음 2개의 비대칭 연결을 그대로 보존한다', () => {
    const detail = {
      ...vocabulary,
      meanings: [
        ...vocabulary.meanings,
        {
          id: ids.secondMeaning,
          meaningKo: '잘 지내',
          partOfSpeech: '인사말',
          difficulty: 2,
          contextNote: '친근한 상황',
        },
      ],
      pronunciations: [
        ...vocabulary.pronunciations,
        {
          id: ids.secondPronunciation,
          pronunciationKo: '싸왓디이',
          toneMarks: 'L-L-M',
          audioUrl:
            'https://media.example.com/vocabularies/greeting-long.mp3?Expires=300',
        },
      ],
      meaningPronunciations: [
        { meaningId: ids.meaning, pronunciationId: ids.pronunciation },
        { meaningId: ids.meaning, pronunciationId: ids.secondPronunciation },
        {
          meaningId: ids.secondMeaning,
          pronunciationId: ids.secondPronunciation,
        },
      ],
      exampleSentences: [],
    };

    expect(vocabularyDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it('존재하지 않는 뜻·발음 연결과 중복 pair를 거부한다', () => {
    const detail = {
      ...vocabulary,
      meaningPronunciations: [
        { meaningId: ids.meaning, pronunciationId: ids.pronunciation },
      ],
      exampleSentences: [],
    };

    expect(() =>
      vocabularyDetailResponseSchema.parse({
        ...detail,
        meaningPronunciations: [
          { meaningId: ids.dangling, pronunciationId: ids.pronunciation },
        ],
      }),
    ).toThrow();
    expect(() =>
      vocabularyDetailResponseSchema.parse({
        ...detail,
        meaningPronunciations: [
          { meaningId: ids.meaning, pronunciationId: ids.dangling },
        ],
      }),
    ).toThrow();
    expect(() =>
      vocabularyDetailResponseSchema.parse({
        ...detail,
        meaningPronunciations: [
          ...detail.meaningPronunciations,
          ...detail.meaningPronunciations,
        ],
      }),
    ).toThrow();
  });

  it('어휘 응답의 내부 상태와 storage key를 모든 중첩 단계에서 거부한다', () => {
    expect(() =>
      vocabularyListResponseSchema.parse({
        items: [{ ...vocabulary, status: 'PUBLISHED' }],
        page,
      }),
    ).toThrow();
    expect(() =>
      vocabularyListResponseSchema.parse({
        items: [
          {
            ...vocabulary,
            pronunciations: [
              {
                ...vocabulary.pronunciations[0],
                storageKey: 'private/vocabularies/greeting.mp3',
              },
            ],
          },
        ],
        page,
      }),
    ).toThrow();
  });

  it('관련 게시 문제 페이지와 저장 어휘 페이지를 공개 형태로 검증한다', () => {
    const relatedQuestion = {
      questionId: ids.question,
      questionVersionId: ids.version,
      questionType: {
        id: ids.type,
        slug: 'reading-standard-choice',
        displayName: '독해 기본 선택',
      },
      skill: 'READING',
      difficulty: 2,
      saved: false,
      firstResult: 'INCORRECT',
    };
    expect(
      vocabularyRelatedQuestionsResponseSchema.parse({
        items: [relatedQuestion],
        page,
      }),
    ).toEqual({ items: [relatedQuestion], page });
    expect(
      savedVocabularyListResponseSchema.parse({
        items: [vocabulary],
        page,
      }),
    ).toEqual({ items: [vocabulary], page });
  });
});
