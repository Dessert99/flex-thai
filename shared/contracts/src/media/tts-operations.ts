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

const httpBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

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

const ttsJobSummaryShape = {
  id: z.uuid(),
  status: ttsJobStatusSchema,
  requestedBy: z.uuid(),
  counts: ttsJobCountsSchema,
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
};

const expectedTtsJobStatus = (
  counts: z.infer<typeof ttsJobCountsSchema>,
): z.infer<typeof ttsJobStatusSchema> => {
  if (counts.processing > 0) return 'RUNNING';
  if (counts.pending > 0) return 'QUEUED';
  if (counts.failed === 0) return 'SUCCEEDED';
  if (counts.succeeded === 0) return 'FAILED';
  return 'PARTIALLY_FAILED';
};

const validateTtsJobAggregate = (
  job: {
    status: z.infer<typeof ttsJobStatusSchema>;
    counts: z.infer<typeof ttsJobCountsSchema>;
  },
  context: z.RefinementCtx,
) => {
  if (job.status !== expectedTtsJobStatus(job.counts)) {
    context.addIssue({
      code: 'custom',
      message: '작업 상태와 항목 집계가 일치해야 합니다',
      path: ['status'],
    });
  }
};

const ttsJobSummarySchema = z
  .object(ttsJobSummaryShape)
  .strict()
  .superRefine(validateTtsJobAggregate);

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
export const ttsJobDetailResponseSchema = z
  .object({
    ...ttsJobSummaryShape,
    voice: ttsVoiceSnapshotSchema,
    items: z.array(ttsItemResponseSchema),
    itemPage: pageMetadataSchema,
  })
  .strict()
  .superRefine(validateTtsJobAggregate);

/** TTS 재시도 접수 응답 */
export const ttsRetryResponseSchema = z
  .object({
    jobId: z.uuid(),
    itemIds: z.array(z.uuid()).min(1).max(100),
    retriedCount: z.number().int().safe().min(1).max(100),
  })
  .strict()
  .superRefine((response, context) => {
    if (new Set(response.itemIds).size !== response.itemIds.length) {
      context.addIssue({
        code: 'custom',
        message: '응답 항목 ID는 중복될 수 없습니다',
        path: ['itemIds'],
      });
    }
    if (response.retriedCount !== response.itemIds.length) {
      context.addIssue({
        code: 'custom',
        message: '재시도 개수와 항목 ID 개수가 같아야 합니다',
        path: ['retriedCount'],
      });
    }
  });

const ttsVoicePresetResponseSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(100),
    provider: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    voice: z.string().trim().min(1).max(100),
    locale: z.literal('th-TH'),
    audioFormat: z.literal('audio/wav'),
    generationRevision: z.string().trim().min(1).max(200),
    enabled: z.boolean(),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

/** TTS voice preset 목록 query */
export const ttsVoicePresetListQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(100).optional(),
    enabled: httpBooleanSchema.optional(),
    ...pageQueryShape,
  })
  .strict();

/** TTS voice preset UUID path */
export const ttsVoicePresetPathSchema = z.object({ presetId: z.uuid() }).strict();

/** 최초 TTS voice preset 생성 요청 */
export const createTtsVoicePresetRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    provider: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    voice: z.string().trim().min(1).max(100),
    locale: z.literal('th-TH'),
    audioFormat: z.literal('audio/wav'),
    generationRevision: z.string().trim().min(1).max(200),
    enabled: z.boolean(),
  })
  .strict();

/** 기존 이름을 유지하는 새 TTS voice preset version 생성 요청 */
export const createTtsVoicePresetVersionRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime(),
    provider: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    voice: z.string().trim().min(1).max(100),
    locale: z.literal('th-TH'),
    audioFormat: z.literal('audio/wav'),
    generationRevision: z.string().trim().min(1).max(200),
    enabled: z.boolean(),
  })
  .strict();

/** TTS voice preset enabled optimistic 변경 요청 */
export const changeTtsVoicePresetEnabledRequestSchema = z
  .object({ expectedUpdatedAt: z.iso.datetime() })
  .strict();

/** TTS voice preset 목록 응답 */
export const ttsVoicePresetListResponseSchema = z
  .object({
    items: z.array(ttsVoicePresetResponseSchema),
    page: pageMetadataSchema,
  })
  .strict();

/** TTS voice preset 상세 응답 */
export const ttsVoicePresetDetailResponseSchema = ttsVoicePresetResponseSchema;

/** 클릭 시 발급하는 TTS 음성 재생 응답 */
export const ttsItemAudioResponseSchema = z
  .object({
    url: z.url(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

/** 게시 readiness 질문·version path */
export const ttsPublicationReadinessPathSchema = z
  .object({ questionId: z.uuid(), versionId: z.uuid() })
  .strict();

const ttsPublicationBlockerSchema = z
  .object({
    kind: z.enum(['THAI_SENTENCE_VERSION', 'VOCABULARY_PRONUNCIATION']),
    targetId: z.uuid(),
    mediaStatus: z.enum(['MISSING', 'UPLOADING', 'FAILED']),
    operation: z
      .object({
        jobId: z.uuid(),
        itemId: z.uuid(),
        itemStatus: ttsItemStatusSchema,
        attempt: z.number().int().safe().nonnegative(),
        errorCode: stableErrorCodeSchema.nullable(),
        retryable: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();

/** 문제 version의 TTS 게시 readiness 응답 */
export const ttsPublicationReadinessResponseSchema = z
  .object({
    ready: z.boolean(),
    requiredCount: z.number().int().safe().nonnegative(),
    readyCount: z.number().int().safe().nonnegative(),
    blockers: z.array(ttsPublicationBlockerSchema),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.ready !== (response.blockers.length === 0)) {
      context.addIssue({
        code: 'custom',
        message: 'ready와 blocker 유무가 일치해야 합니다',
        path: ['ready'],
      });
    }
    if (
      response.requiredCount !==
      response.readyCount + response.blockers.length
    ) {
      context.addIssue({
        code: 'custom',
        message: '필수 수량은 준비 수량과 blocker 수의 합이어야 합니다',
        path: ['requiredCount'],
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

/** TTS voice preset 목록 query */
export type TtsVoicePresetListQuery = z.infer<
  typeof ttsVoicePresetListQuerySchema
>;

/** 최초 TTS voice preset 생성 요청 */
export type CreateTtsVoicePresetRequest = z.infer<
  typeof createTtsVoicePresetRequestSchema
>;

/** 새 TTS voice preset version 생성 요청 */
export type CreateTtsVoicePresetVersionRequest = z.infer<
  typeof createTtsVoicePresetVersionRequestSchema
>;

/** TTS voice preset enabled 변경 요청 */
export type ChangeTtsVoicePresetEnabledRequest = z.infer<
  typeof changeTtsVoicePresetEnabledRequestSchema
>;

/** TTS voice preset 목록 응답 */
export type TtsVoicePresetListResponse = z.infer<
  typeof ttsVoicePresetListResponseSchema
>;

/** TTS voice preset 상세 응답 */
export type TtsVoicePresetDetailResponse = z.infer<
  typeof ttsVoicePresetDetailResponseSchema
>;

/** TTS 음성 재생 응답 */
export type TtsItemAudioResponse = z.infer<typeof ttsItemAudioResponseSchema>;

/** 문제 version의 TTS 게시 readiness 응답 */
export type TtsPublicationReadinessResponse = z.infer<
  typeof ttsPublicationReadinessResponseSchema
>;
