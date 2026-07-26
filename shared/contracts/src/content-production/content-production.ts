/** 콘텐츠 제작 upload·preset·작업 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

/** 콘텐츠 제작이 지원하는 입력 형식 */
export const contentProductionInputTypeSchema = z.enum([
  'TEXT',
  'PDF',
  'IMAGE',
]);

/** 콘텐츠 제작 작업의 생성 목적 */
export const contentProductionPurposeSchema = z.enum([
  'VOCABULARY_EXTRACTION',
  'QUESTION_GENERATION',
  'VOCABULARY_THEN_QUESTION_GENERATION',
]);

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
export const uploadPolicyResponseSchema = z.object({
  uploadId: z.string().uuid(),
  url: z.string().url(),
  fields: z.record(z.string(), z.string()),
  expiresAt: z.string().datetime(),
});

/** 완료 검증된 입력 object 응답 */
export const completedUploadResponseSchema = z.object({
  uploadId: z.string().uuid(),
  inputType: contentProductionInputTypeSchema,
  sizeBytes: z.number().int().positive(),
  status: z.literal('VERIFIED'),
});

/** content-production upload path */
export const contentProductionUploadPathSchema = z.object({
  uploadId: z.string().uuid(),
});

/** 작업 생성 시 고정되는 preset 공개 snapshot */
export const contentProductionPresetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  purpose: contentProductionPurposeSchema,
  version: z.number().int().positive(),
  parameters: z.record(z.string(), z.unknown()),
});

/** preset 목록 응답 */
export const contentProductionPresetListResponseSchema = z.object({
  items: z.array(contentProductionPresetSchema),
});

/** 검증된 입력과 preset으로 작업을 생성하는 요청 */
export const createContentProductionJobRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  purpose: contentProductionPurposeSchema,
  presetId: z.string().uuid(),
  uploadIds: z.array(z.string().uuid()).min(1),
});

const contentProductionJobCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  needsAttention: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

/** 작업 목록과 생성·재시도에서 공유하는 공개 요약 */
export const contentProductionJobSummarySchema = z.object({
  id: z.string().uuid(),
  purpose: contentProductionPurposeSchema,
  status: contentProductionJobStatusSchema,
  attempt: z.number().int().nonnegative().max(3),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  counts: contentProductionJobCountsSchema,
});

/** 작업 목록 query */
export const contentProductionJobListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** 작업 목록 응답 */
export const contentProductionJobListResponseSchema = z.object({
  items: z.array(contentProductionJobSummarySchema),
});

/** 내부 결과를 제외한 항목 공개 상태 */
export const contentProductionJobItemSchema = z.object({
  id: z.string().uuid(),
  status: contentProductionItemStatusSchema,
  attempt: z.number().int().nonnegative().max(3),
  retryable: z.boolean(),
  errorCode: z.string().min(1).nullable(),
});

/** storage key와 provider 응답을 제외한 작업 상세 */
export const contentProductionJobDetailResponseSchema =
  contentProductionJobSummarySchema.extend({
    presetSnapshot: contentProductionPresetSchema,
    inputs: z.array(
      z.object({
        uploadId: z.string().uuid(),
        inputType: contentProductionInputTypeSchema,
        sizeBytes: z.number().int().positive(),
      }),
    ),
    items: z.array(contentProductionJobItemSchema),
  });

/** content-production 작업 path */
export const contentProductionJobPathSchema = z.object({
  jobId: z.string().uuid(),
});

/** 콘텐츠 제작 생성 요청 타입 */
export type CreateContentProductionJobRequest = z.infer<
  typeof createContentProductionJobRequestSchema
>;

/** 콘텐츠 제작 작업 상세 응답 타입 */
export type ContentProductionJobDetailResponse = z.infer<
  typeof contentProductionJobDetailResponseSchema
>;
