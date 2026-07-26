/** 단어장 입력 경계와 공개 응답의 private 필드 차단을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  vocabularyWordbookMembershipResponseSchema,
  wordbookBulkItemsRequestSchema,
  wordbookIdPathSchema,
  wordbookItemListQuerySchema,
  wordbookItemListResponseSchema,
  wordbookItemPathSchema,
  wordbookNameRequestSchema,
  wordbookRemoveItemsRequestSchema,
} from './wordbooks.js';

const ids = {
  wordbook: '00000000-0000-4000-8000-000000000101',
  target: '00000000-0000-4000-8000-000000000102',
  vocabulary: '00000000-0000-4000-8000-000000000103',
  secondVocabulary: '00000000-0000-4000-8000-000000000104',
  meaning: '00000000-0000-4000-8000-000000000105',
  pronunciation: '00000000-0000-4000-8000-000000000106',
} as const;

describe('단어장 요청 계약', () => {
  it('이름을 trim하고 1자부터 50자까지만 허용한다', () => {
    expect(wordbookNameRequestSchema.parse({ name: '  FLEX 어휘  ' })).toEqual({
      name: 'FLEX 어휘',
    });
    expect(() => wordbookNameRequestSchema.parse({ name: '   ' })).toThrow();
    expect(() =>
      wordbookNameRequestSchema.parse({ name: '가'.repeat(51) }),
    ).toThrow();
  });

  it('검색 필터와 HTTP 정수를 공개 query로 변환한다', () => {
    expect(
      wordbookItemListQuerySchema.parse({
        query: ' สวัสดี ',
        kind: 'WORD',
        partOfSpeech: ' 감탄사 ',
        difficulty: '2',
        page: '3',
        pageSize: '40',
      }),
    ).toEqual({
      query: 'สวัสดี',
      kind: 'WORD',
      partOfSpeech: '감탄사',
      difficulty: 2,
      page: 3,
      pageSize: 40,
    });
    expect(wordbookItemListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('알 수 없는 query와 범위를 벗어난 페이지를 거부한다', () => {
    expect(() =>
      wordbookItemListQuerySchema.parse({ status: 'PUBLISHED' }),
    ).toThrow();
    expect(() => wordbookItemListQuerySchema.parse({ page: '0' })).toThrow();
    expect(() =>
      wordbookItemListQuerySchema.parse({ pageSize: '101' }),
    ).toThrow();
    expect(() =>
      wordbookItemListQuerySchema.parse({ difficulty: '6' }),
    ).toThrow();
  });

  it('단어장과 항목 path는 UUID와 알려진 key만 허용한다', () => {
    expect(wordbookIdPathSchema.parse({ wordbookId: ids.wordbook })).toEqual({
      wordbookId: ids.wordbook,
    });
    expect(
      wordbookItemPathSchema.parse({
        wordbookId: ids.wordbook,
        vocabularyId: ids.vocabulary,
      }),
    ).toEqual({
      wordbookId: ids.wordbook,
      vocabularyId: ids.vocabulary,
    });
    expect(() =>
      wordbookIdPathSchema.parse({ wordbookId: 'invalid' }),
    ).toThrow();
    expect(() =>
      wordbookItemPathSchema.parse({
        wordbookId: ids.wordbook,
        vocabularyId: ids.vocabulary,
        ownerId: ids.target,
      }),
    ).toThrow();
  });

  it('bulk 요청은 서로 다른 UUID 1개부터 100개까지만 허용한다', () => {
    expect(
      wordbookBulkItemsRequestSchema.parse({
        vocabularyIds: [ids.vocabulary, ids.secondVocabulary],
        targetWordbookId: ids.target,
      }),
    ).toEqual({
      vocabularyIds: [ids.vocabulary, ids.secondVocabulary],
      targetWordbookId: ids.target,
    });
    expect(() =>
      wordbookBulkItemsRequestSchema.parse({
        vocabularyIds: [ids.vocabulary, ids.vocabulary],
        targetWordbookId: ids.target,
      }),
    ).toThrow();
    expect(() =>
      wordbookRemoveItemsRequestSchema.parse({ vocabularyIds: [] }),
    ).toThrow();
    expect(() =>
      wordbookRemoveItemsRequestSchema.parse({
        vocabularyIds: Array.from(
          { length: 101 },
          (_, index) =>
            `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        ),
      }),
    ).toThrow();
  });
});

describe('단어장 공개 응답 계약', () => {
  const response = {
    wordbook: {
      id: ids.wordbook,
      name: 'FLEX 어휘',
      itemCount: 1,
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T01:00:00.000Z',
    },
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
            audioUrl: 'https://media.example.com/greeting.mp3?Expires=300',
          },
        ],
        saved: true,
        addedAt: '2026-07-26T00:30:00.000Z',
      },
    ],
    page: {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    },
  } as const;

  it('ISO 시각과 공개 어휘 요약을 직렬화한다', () => {
    expect(wordbookItemListResponseSchema.parse(response)).toEqual(response);
    expect(
      vocabularyWordbookMembershipResponseSchema.parse({
        wordbookIds: [ids.wordbook, ids.target],
      }),
    ).toEqual({ wordbookIds: [ids.wordbook, ids.target] });
  });

  it('응답의 storage key와 잘못된 시각을 거부한다', () => {
    expect(() =>
      wordbookItemListResponseSchema.parse({
        ...response,
        items: [
          {
            ...response.items[0],
            pronunciations: [
              {
                ...response.items[0].pronunciations[0],
                storageKey: 'private/greeting.mp3',
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      wordbookItemListResponseSchema.parse({
        ...response,
        wordbook: { ...response.wordbook, createdAt: 'not-a-date' },
      }),
    ).toThrow();
  });
});
