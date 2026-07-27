/** 관리자 TTS 작업 조회·재시도 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

const httpIntegerSchema = (minimum: number, maximum: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/u)
        .transform((value) => Number(value)),
    ])
    .pipe(z.number().int().safe().min(minimum).max(maximum));

const pageQueryShape = {
  page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
  pageSize: httpIntegerSchema(1, 100).default(20),
};

const pageMetadataSchema = z
  .object({
    page: z.number().int().safe().positive(),
    pageSize: z.number().int().safe().min(1).max(100),
    totalItems: z.number().int().safe().nonnegative(),
    totalPages: z.number().int().safe().nonnegative(),
  })
  .strict();

const ttsJobStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'PARTIALLY_FAILED',
  'FAILED',
]);

const ttsItemStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
]);

const ttsTargetKindSchema = z.enum([
  'VOCABULARY_PRONUNCIATION',
  'EXPRESSION',
  'THAI_SENTENCE_VERSION',
  'CONCEPT_SENTENCE',
]);

const stableErrorCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/u);

/** TTS 작업 목록 query */
export const ttsJobListQuerySchema = z
  .object({
    status: ttsJobStatusSchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    ...pageQueryShape,
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.from !== undefined &&
      query.to !== undefined &&
      Date.parse(query.from) > Date.parse(query.to)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'from은 to보다 늦을 수 없습니다',
        path: ['from'],
      });
    }
  });

/** TTS 작업 항목 query */
export const ttsJobItemsQuerySchema = z
  .object({
    status: ttsItemStatusSchema.optional(),
    errorCode: stableErrorCodeSchema.optional(),
    ...pageQueryShape,
  })
  .strict();

/** TTS 작업 UUID path */
export const ttsJobPathSchema = z.object({ jobId: z.uuid() }).strict();

/** TTS 항목 UUID path */
export const ttsItemPathSchema = z.object({ itemId: z.uuid() }).strict();

const retryTtsItemSelectionSchema = z
  .object({
    itemId: z.uuid(),
    expectedAttempt: z.number().int().safe().nonnegative(),
  })
  .strict();

/** TTS 일괄 재시도 요청 */
export const retryTtsJobRequestSchema = z
  .object({
    items: z.array(retryTtsItemSelectionSchema).min(1).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    const itemIds = new Set<string>();
    request.items.forEach((item, index) => {
      if (itemIds.has(item.itemId)) {
        context.addIssue({
          code: 'custom',
          message: '같은 항목을 중복 선택할 수 없습니다',
          path: ['items', index, 'itemId'],
        });
      }
      itemIds.add(item.itemId);
    });
  });

/** TTS 개별 재시도 요청 */
export const retryTtsItemRequestSchema = z
  .object({
    jobId: z.uuid(),
    expectedAttempt: z.number().int().safe().nonnegative(),
  })
  .strict();

const ttsJobCountsSchema = z
  .object({
    pending: z.number().int().safe().nonnegative(),
    processing: z.number().int().safe().nonnegative(),
    succeeded: z.number().int().safe().nonnegative(),
    failed: z.number().int().safe().nonnegative(),
  })
  .strict();

const ttsJobSummarySchema = z
  .object({
    id: z.uuid(),
    status: ttsJobStatusSchema,
    requestedBy: z.uuid(),
    counts: ttsJobCountsSchema,
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .strict();

/** TTS 작업 목록 응답 */
export const ttsJobListResponseSchema = z
  .object({
    items: z.array(ttsJobSummarySchema),
    page: pageMetadataSchema,
  })
  .strict();

const ttsVoiceSnapshotSchema = z
  .object({
    presetId: z.uuid(),
    provider: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    voice: z.string().trim().min(1).max(100),
    locale: z.literal('th-TH'),
    audioFormat: z.literal('audio/wav'),
    generationRevision: z.string().trim().min(1).max(200),
  })
  .strict();

const ttsItemResponseSchema = z
  .object({
    id: z.uuid(),
    target: z
      .object({
        kind: ttsTargetKindSchema,
        targetId: z.uuid(),
        text: z.string().min(1).max(10_000),
        required: z.boolean(),
        revision: z.string().trim().min(1).max(200),
      })
      .strict(),
    status: ttsItemStatusSchema,
    attempt: z.number().int().safe().nonnegative(),
    errorCode: stableErrorCodeSchema.nullable(),
    retryable: z.boolean(),
    mediaAssetId: z.uuid().nullable(),
  })
  .strict();

/** TTS 작업 상세 응답 */
export const ttsJobDetailResponseSchema = ttsJobSummarySchema
  .extend({
    voice: ttsVoiceSnapshotSchema,
    items: z.array(ttsItemResponseSchema),
    itemPage: pageMetadataSchema,
  })
  .strict();

/** TTS 재시도 접수 응답 */
export const ttsRetryResponseSchema = z
  .object({
    jobId: z.uuid(),
    itemIds: z.array(z.uuid()).min(1).max(100),
    retriedCount: z.number().int().safe().min(1).max(100),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.retriedCount !== response.itemIds.length) {
      context.addIssue({
        code: 'custom',
        message: '재시도 개수와 항목 ID 개수가 같아야 합니다',
        path: ['retriedCount'],
      });
    }
  });

/** TTS 작업 목록 query */
export type TtsJobListQuery = z.infer<typeof ttsJobListQuerySchema>;

/** TTS 작업 항목 query */
export type TtsJobItemsQuery = z.infer<typeof ttsJobItemsQuerySchema>;

/** TTS 일괄 재시도 항목 선택 */
export type RetryTtsItemSelection = z.infer<typeof retryTtsItemSelectionSchema>;

/** TTS 개별 재시도 요청 */
export type RetryTtsItemRequest = z.infer<typeof retryTtsItemRequestSchema>;

/** TTS 작업 목록 응답 */
export type TtsJobListResponse = z.infer<typeof ttsJobListResponseSchema>;

/** TTS 작업 상세 응답 */
export type TtsJobDetailResponse = z.infer<typeof ttsJobDetailResponseSchema>;

/** TTS 재시도 접수 응답 */
export type TtsRetryResponse = z.infer<typeof ttsRetryResponseSchema>;
