/** 관리자 어휘 조회·전체 교체 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
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
  pronunciation: '00000000-0000-4000-8000-000000000003',
  media: '00000000-0000-4000-8000-000000000004',
  sentence: '00000000-0000-4000-8000-000000000005',
  questionVersion: '00000000-0000-4000-8000-000000000006',
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
    expect(
      adminVocabularyIdPathSchema.parse({ vocabularyId: ids.vocabulary }),
    ).toEqual({ vocabularyId: ids.vocabulary });
    expect(() =>
      adminVocabularyListQuerySchema.parse({ status: 'RETIRED' }),
    ).toThrow();
  });

  it('어휘 전체 교체는 strict 뜻·발음과 명시적 mapping을 검증한다', () => {
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
      pronunciations: [
        {
          clientRef: 'pronunciation.greeting',
          pronunciationKo: '싸왓디',
          toneMarks: 'L-L-M',
          mediaAssetId: ids.media,
        },
      ],
      meaningPronunciations: [
        {
          meaningRef: 'meaning.greeting',
          pronunciationRef: 'pronunciation.greeting',
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
        meaningPronunciations: [
          {
            meaningRef: 'meaning.missing',
            pronunciationRef: 'pronunciation.greeting',
          },
        ],
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
          meaningCount: 1,
          pronunciationCount: 1,
          updatedAt: '2026-07-24T00:00:00.000Z',
        },
      ],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    } as const;

    expect(adminVocabularyListResponseSchema.parse(response)).toEqual(response);
  });

  it('뜻·발음 mapping과 사용처를 공개하되 storage key와 DB row를 거부한다', () => {
    const detail = {
      id: ids.vocabulary,
      thai: 'สวัสดี',
      kind: 'WORD',
      status: 'DRAFT',
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
          mediaAssetId: ids.media,
          mediaStatus: 'READY',
        },
      ],
      meaningPronunciations: [
        { meaningId: ids.meaning, pronunciationId: ids.pronunciation },
      ],
      usage: {
        sentenceVersionIds: [ids.sentence],
        questionVersionIds: [ids.questionVersion],
      },
      createdAt: '2026-07-24T00:00:00.000Z',
      updatedAt: '2026-07-24T00:00:00.000Z',
    } as const;

    expect(adminVocabularyDetailResponseSchema.parse(detail)).toEqual(detail);
    expect(() =>
      adminVocabularyDetailResponseSchema.parse({
        ...detail,
        pronunciations: [
          { ...detail.pronunciations[0], storageKey: 'audio/private' },
        ],
      }),
    ).toThrow();
    expect(() =>
      adminVocabularyDetailResponseSchema.parse({
        ...detail,
        dbRow: { normalizedThai: 'สวัสดี' },
      }),
    ).toThrow();
  });
});
