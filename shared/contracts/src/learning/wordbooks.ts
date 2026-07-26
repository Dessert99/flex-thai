/** 사용자 소유 단어장과 항목 관리의 공개 JSON 계약을 정의한다 */
import { z } from 'zod';
import { pageMetadataSchema } from './questions.js';
import { vocabularySummarySchema } from './vocabularies.js';

const httpIntegerSchema = (minimum: number, maximum: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/u)
        .transform(Number),
    ])
    .pipe(z.number().safe().int().min(minimum).max(maximum));

const rejectDuplicateVocabularyIds = (
  value: { vocabularyIds: string[] },
  context: z.RefinementCtx,
) => {
  if (new Set(value.vocabularyIds).size !== value.vocabularyIds.length) {
    context.addIssue({
      code: 'custom',
      message: '같은 어휘를 중복 선택할 수 없습니다.',
      path: ['vocabularyIds'],
    });
  }
};

/** 단어장 생성과 이름 변경 요청 */
export const wordbookNameRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
  })
  .strict();

/** 단어장 UUID path */
export const wordbookIdPathSchema = z
  .object({ wordbookId: z.uuid() })
  .strict();

/** 단어장과 공용 어휘 UUID path */
export const wordbookItemPathSchema = z
  .object({
    wordbookId: z.uuid(),
    vocabularyId: z.uuid(),
  })
  .strict();

/** 단어장 항목 검색·필터·페이지 query */
export const wordbookItemListQuerySchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    kind: z.enum(['WORD', 'EXPRESSION']).optional(),
    partOfSpeech: z.string().trim().min(1).optional(),
    difficulty: httpIntegerSchema(1, 5).optional(),
    page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpIntegerSchema(1, 100).default(20),
  })
  .strict();

/** 선택한 어휘를 다른 단어장으로 복사·이동하는 요청 */
export const wordbookBulkItemsRequestSchema = z
  .object({
    vocabularyIds: z.array(z.uuid()).min(1).max(100),
    targetWordbookId: z.uuid(),
  })
  .strict()
  .superRefine(rejectDuplicateVocabularyIds);

/** 선택한 어휘를 현재 단어장에서 제거하는 요청 */
export const wordbookRemoveItemsRequestSchema = z
  .object({
    vocabularyIds: z.array(z.uuid()).min(1).max(100),
  })
  .strict()
  .superRefine(rejectDuplicateVocabularyIds);

/** 항목 수를 포함한 사용자 단어장 요약 */
export const wordbookSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    itemCount: z.number().safe().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

/** 현재 사용자의 단어장 목록 응답 */
export const wordbookListResponseSchema = z
  .object({
    items: z.array(wordbookSummarySchema),
  })
  .strict();

/** 단어장 생성·이름 변경 응답 */
export const wordbookResponseSchema = wordbookSummarySchema;

/** 단어장 정보와 검색된 공개 어휘 항목의 페이지 응답 */
export const wordbookItemListResponseSchema = z
  .object({
    wordbook: wordbookSummarySchema,
    items: z.array(
      vocabularySummarySchema.extend({
        addedAt: z.iso.datetime(),
      }),
    ),
    page: pageMetadataSchema,
  })
  .strict();

/** 한 어휘가 속한 현재 사용자 단어장 ID 목록 */
export const vocabularyWordbookMembershipResponseSchema = z
  .object({
    wordbookIds: z.array(z.uuid()),
  })
  .strict();

/** 검증된 단어장 이름 요청 type */
export type WordbookNameRequest = z.infer<typeof wordbookNameRequestSchema>;

/** 검증된 단어장 UUID path type */
export type WordbookIdPath = z.infer<typeof wordbookIdPathSchema>;

/** 검증된 단어장 항목 UUID path type */
export type WordbookItemPath = z.infer<typeof wordbookItemPathSchema>;

/** 검증된 단어장 항목 목록 query type */
export type WordbookItemListQuery = z.infer<
  typeof wordbookItemListQuerySchema
>;

/** 검증된 단어장 bulk 복사·이동 요청 type */
export type WordbookBulkItemsRequest = z.infer<
  typeof wordbookBulkItemsRequestSchema
>;

/** 검증된 단어장 bulk 제거 요청 type */
export type WordbookRemoveItemsRequest = z.infer<
  typeof wordbookRemoveItemsRequestSchema
>;

/** 직렬화 가능한 단어장 요약 type */
export type WordbookSummary = z.infer<typeof wordbookSummarySchema>;

/** 직렬화 가능한 단어장 목록 응답 type */
export type WordbookListResponse = z.infer<typeof wordbookListResponseSchema>;

/** 직렬화 가능한 단어장 응답 type */
export type WordbookResponse = z.infer<typeof wordbookResponseSchema>;

/** 직렬화 가능한 단어장 항목 목록 응답 type */
export type WordbookItemListResponse = z.infer<
  typeof wordbookItemListResponseSchema
>;

/** 직렬화 가능한 어휘 단어장 membership 응답 type */
export type VocabularyWordbookMembershipResponse = z.infer<
  typeof vocabularyWordbookMembershipResponseSchema
>;
