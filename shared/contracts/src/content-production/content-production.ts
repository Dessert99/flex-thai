/** 콘텐츠 제작 upload·preset·prompt·작업 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

const uuidSchema = z.string().uuid();
const safeNonnegativeIntegerSchema = z.number().int().safe().nonnegative();
const questionPurposes = [
  'QUESTION_GENERATION',
  'VOCABULARY_THEN_QUESTION_GENERATION',
] as const;

/** 콘텐츠 제작이 지원하는 입력 형식 */
export const contentProductionInputTypeSchema = z.enum([
  'TEXT',
  'PDF',
  'IMAGE',
]);

/** 콘텐츠 제작 작업의 생성 목적 */
export const contentProductionPurposeSchema = z.enum([
  'VOCABULARY_EXTRACTION',
  ...questionPurposes,
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

const distinctUuidListSchema = z
  .array(uuidSchema)
  .max(500)
  .refine(
    (values) => new Set(values).size === values.length,
    'UUID 목록은 중복될 수 없습니다.',
  );

const questionTypePlanSchema = z
  .array(
    z
      .object({
        questionTypeVersionId: uuidSchema,
        count: z.number().int().safe().positive().max(100),
      })
      .strict(),
  )
  .min(1)
  .max(100)
  .refine(
    (items) =>
      new Set(items.map(({ questionTypeVersionId }) => questionTypeVersionId))
        .size === items.length,
    '문제 유형 버전은 중복될 수 없습니다.',
  );

const difficultyPlanSchema = z
  .array(
    z
      .object({
        difficulty: z.number().int().safe().min(1).max(5),
        count: z.number().int().safe().positive().max(100),
      })
      .strict(),
  )
  .min(1)
  .max(5)
  .refine(
    (items) =>
      new Set(items.map(({ difficulty }) => difficulty)).size === items.length,
    '난이도는 중복될 수 없습니다.',
  );

const nullableAdditionalInstructionKoSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .nullable();

/** 문제 생성 job마다 고정할 typed 고급 옵션 */
export const contentProductionQuestionOptionsSchema = z
  .object({
    questionCount: z.number().int().safe().min(1).max(100),
    questionTypePlan: questionTypePlanSchema,
    difficultyPlan: difficultyPlanSchema,
    targetVocabularyIds: distinctUuidListSchema,
    requiredVocabularyIds: distinctUuidListSchema,
    excludedVocabularyIds: distinctUuidListSchema,
    newAuxiliaryVocabularyLimit: z.number().int().safe().min(0).max(100),
    similarityThreshold: z.number().finite().min(0).max(1),
    defaultVoicePresetId: uuidSchema,
    speakerVoiceAssignments: z
      .array(
        z
          .object({
            speakerRole: z.string().trim().min(1),
            voicePresetId: uuidSchema,
          })
          .strict(),
      )
      .max(20)
      .refine(
        (items) =>
          new Set(items.map(({ speakerRole }) => speakerRole)).size ===
          items.length,
        'speaker role은 중복될 수 없습니다.',
      ),
    additionalInstructionKo: nullableAdditionalInstructionKoSchema,
  })
  .strict()
  .superRefine((options, context) => {
    const addIssue = (path: string[], message: string) =>
      context.addIssue({ code: 'custom', path, message });
    const typeCount = options.questionTypePlan.reduce(
      (sum, item) => sum + item.count,
      0,
    );
    const difficultyCount = options.difficultyPlan.reduce(
      (sum, item) => sum + item.count,
      0,
    );
    if (typeCount !== options.questionCount) {
      addIssue(
        ['questionTypePlan'],
        '문제 유형 계획 합은 questionCount와 같아야 합니다.',
      );
    }
    if (difficultyCount !== options.questionCount) {
      addIssue(
        ['difficultyPlan'],
        '난이도 계획 합은 questionCount와 같아야 합니다.',
      );
    }
    const vocabularyIds = [
      ...options.targetVocabularyIds,
      ...options.requiredVocabularyIds,
      ...options.excludedVocabularyIds,
    ];
    if (new Set(vocabularyIds).size !== vocabularyIds.length) {
      addIssue(
        ['targetVocabularyIds'],
        'target·required·excluded 어휘는 서로 겹칠 수 없습니다.',
      );
    }
  });

/** 어휘 추출 preset이 소유하는 안정 정책 */
export const vocabularyExtractionPresetParametersSchema = z
  .object({
    suspectedDuplicateMaxCodePointDistance: safeNonnegativeIntegerSchema,
  })
  .strict();

/** 문제 생성 preset이 소유하는 정책과 job 기본값 */
export const questionGenerationPresetParametersSchema =
  contentProductionQuestionOptionsSchema
    .extend({
      commonPrinciples: z.array(z.string().trim().min(1)).max(100).default([]),
      similarQuestions: z
        .array(
          z
            .object({
              difficulty: z.number().int().safe().min(1).max(5),
              summary: z.string().trim().min(1).max(1_000),
            })
            .strict(),
        )
        .max(100)
        .default([]),
    })
    .strict();

/** 복합 preset이 어휘 정책과 문제 생성 정책을 함께 소유한다 */
export const combinedProductionPresetParametersSchema =
  questionGenerationPresetParametersSchema
    .extend({
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

const questionJobConfigurationSchemas = questionPurposes.map((purpose) =>
  z
    .object({
      purpose: z.literal(purpose),
      presetId: uuidSchema,
      options: contentProductionQuestionOptionsSchema,
    })
    .strict(),
);

/** preset 선택과 job별 override를 목적별 strict 입력으로 제한한다 */
export const contentProductionJobConfigurationSchema = z.discriminatedUnion(
  'purpose',
  [vocabularyJobConfigurationSchema, ...questionJobConfigurationSchemas],
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
  z
    .object({
      ...contentProductionPresetBaseShape,
      purpose: z.literal('QUESTION_GENERATION'),
      parameters: questionGenerationPresetParametersSchema,
    })
    .strict(),
  z
    .object({
      ...contentProductionPresetBaseShape,
      purpose: z.literal('VOCABULARY_THEN_QUESTION_GENERATION'),
      parameters: combinedProductionPresetParametersSchema,
    })
    .strict(),
]);

/** preset 목록 응답 */
export const contentProductionPresetListResponseSchema = z
  .object({ items: z.array(contentProductionPresetSchema) })
  .strict();

const createJobCommonShape = {
  clientRequestId: uuidSchema,
  uploadIds: z.array(uuidSchema).min(1),
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
    ...questionPurposes.map((purpose) =>
      z
        .object({
          ...createJobCommonShape,
          purpose: z.literal(purpose),
          presetId: uuidSchema,
          options: contentProductionQuestionOptionsSchema,
        })
        .strict(),
    ),
  ],
);

/** worker와 같은 prompt builder를 호출할 item 선택 요청 */
export const promptPreviewRequestSchema = z.discriminatedUnion('purpose', [
  z
    .object({
      purpose: z.literal('QUESTION_GENERATION'),
      presetId: uuidSchema,
      options: contentProductionQuestionOptionsSchema,
      questionPlanIndex: z.number().int().safe().nonnegative().max(99),
    })
    .strict(),
  z
    .object({
      purpose: z.literal('VOCABULARY_THEN_QUESTION_GENERATION'),
      presetId: uuidSchema,
      options: contentProductionQuestionOptionsSchema,
      questionPlanIndex: z.number().int().safe().nonnegative().max(99),
    })
    .strict(),
]);

/** provider 비공개값 없이 안전한 prompt section과 최종 prompt를 반환한다 */
export const promptPreviewResponseSchema = z
  .object({
    promptVersion: z.string().min(1),
    questionPlanIndex: z.number().int().safe().nonnegative(),
    sections: z.array(
      z.object({ name: z.string().min(1), content: z.unknown() }).strict(),
    ),
    prompt: z.string().min(1),
  })
  .strict();

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
export const createContentProductionPresetRequestSchema = z
  .object({
    requestId: uuidSchema,
    name: z.string().trim().min(1).max(200),
    purpose: contentProductionPurposeSchema,
    parameters: z.union([
      vocabularyExtractionPresetParametersSchema,
      questionGenerationPresetParametersSchema,
      combinedProductionPresetParametersSchema,
    ]),
  })
  .strict();

/** 기존 preset 이름의 다음 immutable version 생성 요청 */
export const createContentProductionPresetVersionRequestSchema = z
  .object({
    requestId: uuidSchema,
    parameters: z.union([
      vocabularyExtractionPresetParametersSchema,
      questionGenerationPresetParametersSchema,
      combinedProductionPresetParametersSchema,
    ]),
  })
  .strict();

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
    z
      .object({
        ...contentProductionPresetBaseShape,
        ...contentProductionPresetVersionStateShape,
        purpose: z.literal('QUESTION_GENERATION'),
        parameters: questionGenerationPresetParametersSchema,
      })
      .strict(),
    z
      .object({
        ...contentProductionPresetBaseShape,
        ...contentProductionPresetVersionStateShape,
        purpose: z.literal('VOCABULARY_THEN_QUESTION_GENERATION'),
        parameters: combinedProductionPresetParametersSchema,
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

/** 콘텐츠 제작 문제 옵션 타입 */
export type ContentProductionQuestionOptions = z.infer<
  typeof contentProductionQuestionOptionsSchema
>;

/** 콘텐츠 제작 생성 요청 타입 */
export type CreateContentProductionJobRequest = z.infer<
  typeof createContentProductionJobRequestSchema
>;

/** 콘텐츠 제작 prompt 미리보기 요청 타입 */
export type PromptPreviewRequest = z.infer<typeof promptPreviewRequestSchema>;

/** 콘텐츠 제작 prompt 미리보기 응답 타입 */
export type PromptPreviewResponse = z.infer<typeof promptPreviewResponseSchema>;

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
