/** 학습자 신고와 관리자 처리에 사용하는 콘텐츠 오류 신고 공개 계약을 정의한다 */
import { z } from 'zod';

const uuidSchema = z.uuid();
const utcDateTimeSchema = z.string().datetime();
const httpIntegerSchema = (maximum: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/u)
        .transform(Number),
    ])
    .pipe(z.number().int().safe().min(1).max(maximum));

/** 오류 신고 대상 콘텐츠 종류 */
export const contentErrorReportTargetKindSchema = z.enum([
  'QUESTION',
  'VOCABULARY',
  'SENTENCE',
  'AUDIO',
  'CONCEPT',
]);

/** 학습자가 선택하는 오류 분류 */
export const contentErrorReportCategorySchema = z.enum([
  'MEANING_TRANSLATION',
  'PRONUNCIATION_TONE',
  'AUDIO',
  'ANSWER_EXPLANATION',
  'TOKENIZATION',
  'OTHER',
]);

/** 관리자 처리 workflow 상태 */
export const contentErrorReportStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
]);

const nullableUuidSchema = uuidSchema.nullable();

/** 브라우저가 현재 공개 화면에서 전달할 수 있는 대상 origin */
export const contentErrorReportOriginSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('QUESTION'),
      questionId: uuidSchema,
      questionVersionId: uuidSchema,
      blockId: nullableUuidSchema,
      sentenceVersionId: nullableUuidSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('VOCABULARY'),
      vocabularyId: uuidSchema,
      meaningId: nullableUuidSchema,
      pronunciationId: nullableUuidSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('SENTENCE'),
      sentenceVersionId: uuidSchema,
      tokenPosition: z.number().int().safe().nonnegative().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('AUDIO'),
      source: z.discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('VOCABULARY'),
            pronunciationId: uuidSchema,
          })
          .strict(),
        z
          .object({
            kind: z.literal('SENTENCE'),
            sentenceVersionId: uuidSchema,
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('CONCEPT'),
      conceptId: uuidSchema,
      conceptVersionId: uuidSchema,
      blockId: nullableUuidSchema,
    })
    .strict(),
]);

/** 오류 신고 생성 요청 */
export const createContentErrorReportRequestSchema = z
  .object({
    origin: contentErrorReportOriginSchema,
    category: contentErrorReportCategorySchema,
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

/** 접수 완료 응답 */
export const createContentErrorReportResponseSchema = z
  .object({
    id: uuidSchema,
    status: z.literal('OPEN'),
    createdAt: utcDateTimeSchema,
  })
  .strict();

/** 관리자 목록 필터와 페이지 query */
export const adminContentErrorReportListQuerySchema = z
  .object({
    status: contentErrorReportStatusSchema.optional(),
    targetKind: contentErrorReportTargetKindSchema.optional(),
    category: contentErrorReportCategorySchema.optional(),
    assigneeUserId: uuidSchema.optional(),
    page: httpIntegerSchema(Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpIntegerSchema(100).default(20),
  })
  .strict();

/** 오류 신고 UUID path */
export const contentErrorReportIdPathSchema = z
  .object({ reportId: uuidSchema })
  .strict();

/** 관리자 상태 변경 요청 */
export const changeContentErrorReportStatusRequestSchema = z
  .object({ status: contentErrorReportStatusSchema })
  .strict();

/** 관리자 담당자 배정 요청 */
export const assignContentErrorReportRequestSchema = z
  .object({ assigneeUserId: uuidSchema })
  .strict();

/** 서버가 확정한 대상 식별자 */
export const contentErrorReportCanonicalReferenceSchema = z
  .object({
    kind: contentErrorReportTargetKindSchema,
    contentId: uuidSchema,
    contentVersionId: nullableUuidSchema,
    questionVersionId: nullableUuidSchema,
    sentenceVersionId: nullableUuidSchema,
    mediaAssetId: nullableUuidSchema,
    locationId: nullableUuidSchema,
  })
  .strict();

/** 제출 시점 표시 문맥 snapshot */
export const contentErrorReportSnapshotSchema = z
  .object({
    title: z.string().min(1),
    primaryText: z.string().min(1),
    secondaryText: z.string().nullable(),
    versionLabel: z.string().nullable(),
    locationLabel: z.string().min(1),
    audioAssetId: nullableUuidSchema,
  })
  .strict();

const userSummarySchema = z
  .object({ id: uuidSchema, email: z.email() })
  .strict();
const historySchema = z
  .object({
    id: uuidSchema,
    action: z.enum(['SUBMITTED', 'STATUS_CHANGED', 'ASSIGNEE_CHANGED']),
    actor: userSummarySchema,
    fromStatus: contentErrorReportStatusSchema.nullable(),
    toStatus: contentErrorReportStatusSchema.nullable(),
    fromAssigneeUserId: nullableUuidSchema,
    toAssigneeUserId: nullableUuidSchema,
    createdAt: utcDateTimeSchema,
  })
  .strict();
const summarySchema = z
  .object({
    id: uuidSchema,
    reporter: userSummarySchema,
    targetKind: contentErrorReportTargetKindSchema,
    category: contentErrorReportCategorySchema,
    status: contentErrorReportStatusSchema,
    assignee: userSummarySchema.nullable(),
    description: z.string().nullable(),
    snapshot: contentErrorReportSnapshotSchema,
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  })
  .strict();

/** 관리자 오류 신고 목록 응답 */
export const adminContentErrorReportListResponseSchema = z
  .object({
    items: z.array(summarySchema),
    page: z
      .object({
        page: z.number().int().safe().positive(),
        pageSize: z.number().int().safe().min(1).max(100),
        totalItems: z.number().int().safe().nonnegative(),
        totalPages: z.number().int().safe().nonnegative(),
      })
      .strict(),
  })
  .strict();

/** 관리자 오류 신고 상세 응답 */
export const adminContentErrorReportDetailResponseSchema = summarySchema
  .extend({
    canonicalReference: contentErrorReportCanonicalReferenceSchema,
    history: z.array(historySchema),
  })
  .strict();

/** 공개 origin type */
export type ContentErrorReportOrigin = z.infer<
  typeof contentErrorReportOriginSchema
>;
/** 공개 대상 종류 type */
export type ContentErrorReportTargetKind = z.infer<
  typeof contentErrorReportTargetKindSchema
>;
/** 공개 신고 분류 type */
export type ContentErrorReportCategory = z.infer<
  typeof contentErrorReportCategorySchema
>;
/** 공개 처리 상태 type */
export type ContentErrorReportStatus = z.infer<
  typeof contentErrorReportStatusSchema
>;
/** 신고 생성 요청 type */
export type CreateContentErrorReportRequest = z.infer<
  typeof createContentErrorReportRequestSchema
>;
/** 신고 생성 응답 type */
export type CreateContentErrorReportResponse = z.infer<
  typeof createContentErrorReportResponseSchema
>;
/** 관리자 목록 query type */
export type AdminContentErrorReportListQuery = z.infer<
  typeof adminContentErrorReportListQuerySchema
>;
/** 관리자 목록 응답 type */
export type AdminContentErrorReportListResponse = z.infer<
  typeof adminContentErrorReportListResponseSchema
>;
/** 관리자 상세 응답 type */
export type AdminContentErrorReportDetailResponse = z.infer<
  typeof adminContentErrorReportDetailResponseSchema
>;
