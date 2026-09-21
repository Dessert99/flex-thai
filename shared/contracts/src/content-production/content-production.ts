/** 콘텐츠 제작 upload·preset·prompt·작업 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

const uuidSchema = z.string().uuid();
const safeNonnegativeIntegerSchema = z.number().int().safe().nonnegative();

/** 콘텐츠 제작이 지원하는 입력 형식 */
export const contentProductionInputTypeSchema = z.enum([
  'TEXT',
  'PDF',
  'IMAGE',
]);

/** 콘텐츠 제작 작업의 생성 목적 */
export const contentProductionPurposeSchema = z.enum(['VOCABULARY_EXTRACTION']);

/** 콘텐츠 제작 작업의 전체 상태 */
export const contentProductionJobStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_FAILURES',
  'FAILED',
]);

/** 콘텐츠 제작 항목의 개별 상태 */
export const contentProductionItemStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'NEEDS_ATTENTION',
  'FAILED',
]);

/** 어휘 추출 preset이 소유하는 안정 정책 */
export const vocabularyExtractionPresetParametersSchema = z
  .object({
    suspectedDuplicateMaxCodePointDistance: safeNonnegativeIntegerSchema,
  })
  .strict();

const vocabularyJobConfigurationSchema = z
  .object({
    purpose: z.literal('VOCABULARY_EXTRACTION'),
    presetId: uuidSchema,
    options: z.object({}).strict(),
  })
  .strict();

/** preset 선택과 job별 override를 목적별 strict 입력으로 제한한다 */
export const contentProductionJobConfigurationSchema = z.discriminatedUnion(
  'purpose',
  [vocabularyJobConfigurationSchema],
);

/** private 입력 object 정책 생성 요청 */
export const uploadPolicyRequestSchema = z
  .object({
    inputType: contentProductionInputTypeSchema,
    contentType: z.string().min(1),
    declaredSizeBytes: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
  })
  .strict()
  .superRefine((value, context) => {
    const allowedContentTypes = {
      TEXT: ['text/plain'],
      PDF: ['application/pdf'],
      IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
    }[value.inputType];
    if (!allowedContentTypes.includes(value.contentType)) {
      context.addIssue({
        code: 'custom',
        path: ['contentType'],
        message: '입력 형식에 허용되지 않은 MIME입니다.',
      });
    }
  });

/** private 입력 object 정책 응답 */
export const uploadPolicyResponseSchema = z
  .object({
    uploadId: uuidSchema,
    url: z.string().url(),
    fields: z.record(z.string(), z.string()),
    expiresAt: z.string().datetime(),
  })
  .strict();

/** 완료 검증된 입력 object 응답 */
export const completedUploadResponseSchema = z
  .object({
    uploadId: uuidSchema,
    inputType: contentProductionInputTypeSchema,
    sizeBytes: z.number().int().positive(),
    status: z.literal('VERIFIED'),
  })
  .strict();

/** content-production upload path */
export const contentProductionUploadPathSchema = z
  .object({ uploadId: uuidSchema })
  .strict();

const contentProductionPresetBaseShape = {
  id: uuidSchema,
  name: z.string().trim().min(1).max(200),
  version: z.number().int().positive(),
};

/** 작업 생성 시 고정되는 목적별 strict preset 공개 snapshot */
export const contentProductionPresetSchema = z.discriminatedUnion('purpose', [
  z
    .object({
      ...contentProductionPresetBaseShape,
      purpose: z.literal('VOCABULARY_EXTRACTION'),
      parameters: vocabularyExtractionPresetParametersSchema,
    })
    .strict(),
]);

/** preset 목록 응답 */
export const contentProductionPresetListResponseSchema = z
  .object({ items: z.array(contentProductionPresetSchema) })
  .strict();

const createJobCommonShape = {
  clientRequestId: uuidSchema,
  uploadIds: z.array(uuidSchema).min(1).max(100),
};

/** 검증된 입력과 effective preset snapshot으로 작업을 생성하는 요청 */
export const createContentProductionJobRequestSchema = z.discriminatedUnion(
  'purpose',
  [
    z
      .object({
        ...createJobCommonShape,
        purpose: z.literal('VOCABULARY_EXTRACTION'),
        presetId: uuidSchema,
        options: z.object({}).strict(),
      })
      .strict(),
  ],
);

const contentProductionJobCountsSchema = z
  .object({
    total: safeNonnegativeIntegerSchema,
    succeeded: safeNonnegativeIntegerSchema,
    needsAttention: safeNonnegativeIntegerSchema,
    failed: safeNonnegativeIntegerSchema,
  })
  .strict();

/** 작업 목록과 생성·재시도에서 공유하는 공개 요약 */
export const contentProductionJobSummarySchema = z
  .object({
    id: uuidSchema,
    purpose: contentProductionPurposeSchema,
    status: contentProductionJobStatusSchema,
    attempt: safeNonnegativeIntegerSchema.max(3),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    counts: contentProductionJobCountsSchema,
  })
  .strict();

/** 작업 목록 query */
export const contentProductionJobListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** 작업 목록 응답 */
export const contentProductionJobListResponseSchema = z
  .object({ items: z.array(contentProductionJobSummarySchema) })
  .strict();

/** 내부 결과를 제외한 항목 공개 상태 */
export const contentProductionJobItemSchema = z
  .object({
    id: uuidSchema,
    status: contentProductionItemStatusSchema,
    attempt: safeNonnegativeIntegerSchema.max(3),
    retryable: z.boolean(),
    errorCode: z.string().min(1).nullable(),
  })
  .strict();

/** storage key와 provider 응답을 제외한 작업 상세 */
export const contentProductionJobDetailResponseSchema =
  contentProductionJobSummarySchema
    .extend({
      presetSnapshot: contentProductionPresetSchema,
      inputs: z.array(
        z
          .object({
            uploadId: uuidSchema,
            inputType: contentProductionInputTypeSchema,
            sizeBytes: z.number().int().positive(),
          })
          .strict(),
      ),
      items: z.array(contentProductionJobItemSchema),
    })
    .strict();

/** content-production 작업 path */
export const contentProductionJobPathSchema = z
  .object({ jobId: uuidSchema })
  .strict();

/** content-production preset path */
export const contentProductionPresetPathSchema = z
  .object({ presetId: uuidSchema })
  .strict();

/** 최초 content-production preset version 생성 요청 */
export const createContentProductionPresetRequestSchema = z.discriminatedUnion(
  'purpose',
  [
    z
      .object({
        requestId: uuidSchema,
        name: z.string().trim().min(1).max(200),
        purpose: z.literal('VOCABULARY_EXTRACTION'),
        parameters: vocabularyExtractionPresetParametersSchema,
      })
      .strict(),
  ],
);

/** 기존 preset 이름의 다음 immutable version 생성 요청 */
export const createContentProductionPresetVersionRequestSchema =
  z.discriminatedUnion('purpose', [
    z
      .object({
        requestId: uuidSchema,
        purpose: z.literal('VOCABULARY_EXTRACTION'),
        parameters: vocabularyExtractionPresetParametersSchema,
      })
      .strict(),
  ]);

/** preset enabled 상태의 optimistic revision command */
export const setContentProductionPresetEnabledRequestSchema = z
  .object({
    enabled: z.boolean(),
    expectedRevision: safeNonnegativeIntegerSchema,
    requestId: uuidSchema,
  })
  .strict();

const contentProductionPresetVersionStateShape = {
  enabled: z.boolean(),
  revision: safeNonnegativeIntegerSchema,
  createdAt: z.string().datetime(),
};

/** preset version 운영 목록의 공개 row */
export const contentProductionPresetVersionSchema = z.discriminatedUnion(
  'purpose',
  [
    z
      .object({
        ...contentProductionPresetBaseShape,
        ...contentProductionPresetVersionStateShape,
        purpose: z.literal('VOCABULARY_EXTRACTION'),
        parameters: vocabularyExtractionPresetParametersSchema,
      })
      .strict(),
  ],
);

/** preset version 운영 목록 응답 */
export const contentProductionPresetVersionListResponseSchema = z
  .object({ items: z.array(contentProductionPresetVersionSchema) })
  .strict();

/** 콘텐츠 제작 job 구성 타입 */
export type ContentProductionJobConfiguration = z.infer<
  typeof contentProductionJobConfigurationSchema
>;

/** 콘텐츠 제작 생성 요청 타입 */
export type CreateContentProductionJobRequest = z.infer<
  typeof createContentProductionJobRequestSchema
>;

/** 콘텐츠 제작 preset snapshot 타입 */
export type ContentProductionPreset = z.infer<
  typeof contentProductionPresetSchema
>;

/** 콘텐츠 제작 preset version 타입 */
export type ContentProductionPresetVersion = z.infer<
  typeof contentProductionPresetVersionSchema
>;

/** 콘텐츠 제작 preset 목록 응답 타입 */
export type ContentProductionPresetListResponse = z.infer<
  typeof contentProductionPresetListResponseSchema
>;

/** 콘텐츠 제작 작업 요약 타입 */
export type ContentProductionJobSummary = z.infer<
  typeof contentProductionJobSummarySchema
>;

/** 콘텐츠 제작 작업 목록 응답 타입 */
export type ContentProductionJobListResponse = z.infer<
  typeof contentProductionJobListResponseSchema
>;

/** 콘텐츠 제작 작업 상세 응답 타입 */
export type ContentProductionJobDetailResponse = z.infer<
  typeof contentProductionJobDetailResponseSchema
>;

/** 최초 콘텐츠 제작 preset 요청 타입 */
export type CreateContentProductionPresetRequest = z.infer<
  typeof createContentProductionPresetRequestSchema
>;

/** 콘텐츠 제작 preset 새 version 요청 타입 */
export type CreateContentProductionPresetVersionRequest = z.infer<
  typeof createContentProductionPresetVersionRequestSchema
>;

/** 콘텐츠 제작 preset enabled 요청 타입 */
export type SetContentProductionPresetEnabledRequest = z.infer<
  typeof setContentProductionPresetEnabledRequestSchema
>;
