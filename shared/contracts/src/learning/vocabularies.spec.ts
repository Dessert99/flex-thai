/** 학습자 어휘 API의 검색·상세·관련 문제 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  vocabularyDetailResponseSchema,
  vocabularyListQuerySchema,
  vocabularyListResponseSchema,
} from './vocabularies.js';

const ids = {
  vocabulary: '00000000-0000-4000-8000-000000000021',
  meaning: '00000000-0000-4000-8000-000000000022',
  sentence: '00000000-0000-4000-8000-000000000024',
  question: '00000000-0000-4000-8000-000000000025',
  version: '00000000-0000-4000-8000-000000000026',
  type: '00000000-0000-4000-8000-000000000027',
  secondMeaning: '00000000-0000-4000-8000-000000000028',
  dangling: '00000000-0000-4000-8000-000000000030',
  relation: '00000000-0000-4000-8000-000000000031',
  relatedVocabulary: '00000000-0000-4000-8000-000000000032',
  relatedMeaning: '00000000-0000-4000-8000-000000000033',
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
});

describe('학습자 어휘 공개 응답 계약', () => {
  it('어휘 상세에 게시 문장의 공개 예문을 허용한다', () => {
    const detail = {
      ...vocabulary,
      relations: [
        {
          id: ids.relation,
          type: 'SYNONYM',
          direction: 'BIDIRECTIONAL',
          meaningId: ids.meaning,
          relatedVocabularyId: ids.relatedVocabulary,
          relatedThai: 'หวัดดี',
          relatedMeaningId: ids.relatedMeaning,
          relatedMeaningKo: '안녕',
        },
      ],
      exampleSentences: [
        {
          sentenceVersionId: ids.sentence,
          originalText: 'เขาพูดว่าสวัสดี',
          translationKo: '그는 안녕하세요라고 말했다',
          tokens: [],
          expressions: [],
        },
      ],
    };
    expect(vocabularyDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it('서로 다른 두 뜻과 문맥 설명을 그대로 보존한다', () => {
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
      relations: [],
      exampleSentences: [],
    };

    expect(vocabularyDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it('제거된 발음·성조 필드는 공개 응답에서 거부한다', () => {
    const detail = {
      ...vocabulary,
      relations: [],
      exampleSentences: [],
    };

    expect(() =>
      vocabularyDetailResponseSchema.parse({
        ...detail,
        pronunciations: [],
      }),
    ).toThrow();
    expect(() =>
      vocabularyDetailResponseSchema.parse({
        ...detail,
        meaningPronunciations: [],
      }),
    ).toThrow();
    expect(() =>
      vocabularyDetailResponseSchema.parse({
        ...detail,
        meanings: [
          {
            ...vocabulary.meanings[0],
            pronunciationKo: '한글 표기',
            toneMarks: 'M',
          },
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
            storageKey: 'private',
          },
        ],
        page,
      }),
    ).toThrow();
  });
});
