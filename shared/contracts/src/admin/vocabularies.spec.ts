/** 관리자 어휘 조회·전체 교체 공개 계약을 검증한다 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AdminVocabularyIdPath } from './vocabularies.js';
import {
  adminVocabularyDetailResponseSchema,
  adminVocabularyIdPathSchema,
  adminVocabularyListQuerySchema,
  adminVocabularyListResponseSchema,
  adminVocabularyReplaceRequestSchema,
} from './vocabularies.js';

const ids = {
  vocabulary: '00000000-0000-4000-8000-000000000001',
  meaning: '00000000-0000-4000-8000-000000000002',
  sentence: '00000000-0000-4000-8000-000000000005',
  relation: '00000000-0000-4000-8000-000000000007',
  relatedMeaning: '00000000-0000-4000-8000-000000000008',
} as const;

describe('관리자 어휘 path·query·교체 계약', () => {
  it('모든 상태의 어휘 필터와 UUID path를 strict하게 검증한다', () => {
    expect(
      adminVocabularyListQuerySchema.parse({
        query: 'สวัสดี',
        kind: 'WORD',
        status: 'HIDDEN',
        page: '2',
      }),
    ).toEqual({
      query: 'สวัสดี',
      kind: 'WORD',
      status: 'HIDDEN',
      page: 2,
      pageSize: 20,
    });
    const path = adminVocabularyIdPathSchema.parse({
      vocabularyId: ids.vocabulary,
    });
    expect(path).toEqual({ vocabularyId: ids.vocabulary });
    expectTypeOf(path).toEqualTypeOf<AdminVocabularyIdPath>();
    expect(() =>
      adminVocabularyListQuerySchema.parse({ status: 'RETIRED' }),
    ).toThrow();
  });

  it('어휘 전체 교체는 중복 뜻과 지원하지 않는 필드를 거부한다', () => {
    const request = {
      thai: 'สวัสดี',
      kind: 'WORD',
      meanings: [
        {
          clientRef: 'meaning.greeting',
          meaningKo: '안녕하세요',
          partOfSpeech: '감탄사',
          difficulty: 1,
          contextNote: null,
        },
      ],
    } as const;

    expect(adminVocabularyReplaceRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      adminVocabularyReplaceRequestSchema.parse({
        ...request,
        meanings: [request.meanings[0], request.meanings[0]],
      }),
    ).toThrow();
    expect(() =>
      adminVocabularyReplaceRequestSchema.parse({
        ...request,
        internal: true,
      }),
    ).toThrow();
  });
});

describe('관리자 어휘 공개 응답 계약', () => {
  it('모든 상태 목록을 공개 페이지로 검증한다', () => {
    const response = {
      items: [
        {
          id: ids.vocabulary,
          thai: 'สวัสดี',
          kind: 'WORD',
          status: 'DRAFT',
          mergedIntoVocabularyId: null,
          meaningCount: 1,
          updatedAt: '2026-07-24T00:00:00.000Z',
        },
      ],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    } as const;

    expect(adminVocabularyListResponseSchema.parse(response)).toEqual(response);
  });

  it('뜻과 사용처를 공개하되 내부 필드와 제거된 발음 필드를 거부한다', () => {
    const detail = {
      id: ids.vocabulary,
      thai: 'สวัสดี',
      kind: 'WORD',
      status: 'DRAFT',
      mergedIntoVocabularyId: null,
      meanings: [
        {
          id: ids.meaning,
          meaningKo: '안녕하세요',
          partOfSpeech: '감탄사',
          difficulty: 1,
          contextNote: null,
        },
      ],
      relations: [
        {
          id: ids.relation,
          sourceMeaningId: ids.meaning,
          targetMeaningId: ids.relatedMeaning,
          type: 'RELATED',
          direction: 'DIRECTED',
          status: 'PENDING',
          createdAt: '2026-07-24T00:00:00.000Z',
          updatedAt: '2026-07-24T00:00:00.000Z',
        },
      ],
      importanceWeight: 5,
      usage: {
        sentenceVersionIds: [ids.sentence],
      },
      createdAt: '2026-07-24T00:00:00.000Z',
      updatedAt: '2026-07-24T00:00:00.000Z',
    } as const;

    expect(adminVocabularyDetailResponseSchema.parse(detail)).toEqual(detail);
    expect(() =>
      adminVocabularyDetailResponseSchema.parse({
        ...detail,
        dbRow: { normalizedThai: 'สวัสดี' },
      }),
    ).toThrow();
    expect(() =>
      adminVocabularyDetailResponseSchema.parse({
        ...detail,
        meanings: [detail.meanings[0], detail.meanings[0]],
      }),
    ).toThrow();
    expect(() =>
      adminVocabularyDetailResponseSchema.parse({
        ...detail,
        pronunciations: [],
      }),
    ).toThrow();
    expect(() =>
      adminVocabularyDetailResponseSchema.parse({
        ...detail,
        meaningPronunciations: [],
      }),
    ).toThrow();
    expect(() =>
      adminVocabularyDetailResponseSchema.parse({
        ...detail,
        meanings: [{ ...detail.meanings[0], pronunciationKo: '한글 표기' }],
      }),
    ).toThrow();
    expect(() =>
      adminVocabularyDetailResponseSchema.parse({
        ...detail,
        meanings: [{ ...detail.meanings[0], toneMarks: 'M' }],
      }),
    ).toThrow();
  });
});
