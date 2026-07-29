/** AI 문제 후보의 관리자 검수 요청·응답에서 안전한 canonical JSON 경계를 정의한다 */
import { z } from 'zod';

const uuidSchema = z.uuid();
const utcDateTimeSchema = z.string().datetime();
const nonnegativeIntegerSchema = z.number().int().safe().nonnegative();
const positiveIntegerSchema = z.number().int().safe().positive();
const difficultySchema = z.number().int().safe().min(1).max(5);

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

/** 후보 검수 결과의 우선순위 그룹 */
export const questionCandidateGroupSchema = z.enum([
  'NORMAL',
  'NEEDS_ATTENTION',
  'FAILED',
]);

/** 후보의 관리자 검수 lifecycle 상태 */
export const questionCandidateReviewStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'DISCARDED',
]);

/** 후보마다 한 번씩 기록하는 검증 단계 */
export const questionCandidateValidationStageSchema = z.enum([
  'SCHEMA',
  'DECISION_RULE',
  'SIMILARITY',
  'AI_CROSS_VALIDATION',
]);

/** 후보 검증 단계의 결과 */
export const questionCandidateValidationStatusSchema = z.enum([
  'PASSED',
  'FAILED',
  'SKIPPED',
]);

/** 검수 명령이 노출할 수 있는 안정적인 상태 전이 오류 code */
export const questionCandidateReviewErrorCodeSchema = z.enum([
  'QUESTION_CANDIDATE_NOT_APPROVABLE',
  'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT',
  'QUESTION_CANDIDATE_REVIEW_CONFLICT',
]);

const contentReferenceSchema = z
  .union([
    z.object({ id: uuidSchema }).strict(),
    z.object({ clientRef: z.string().trim().min(1) }).strict(),
  ])
  .refine(
    (reference) => Object.keys(reference).length === 1,
    '콘텐츠 참조는 id 또는 clientRef 하나여야 합니다.',
  );

const generatedSentenceSchema = z
  .object({
    originalText: z.string().min(1),
    translationKo: z.string().min(1),
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    tokens: z.array(
      z
        .object({
          surface: z.string().min(1),
          startOffset: nonnegativeIntegerSchema,
          endOffset: positiveIntegerSchema,
          vocabulary: contentReferenceSchema,
          meaning: contentReferenceSchema,
          pronunciation: contentReferenceSchema,
          contextMeaningKo: z.string().min(1),
          role: z.enum(['TARGET', 'REQUIRED', 'SUPPORTING', 'INSTRUCTION']),
        })
        .strict(),
    ),
    expressions: z.array(
      z
        .object({
          startTokenIndex: nonnegativeIntegerSchema,
          endTokenIndex: positiveIntegerSchema,
          vocabulary: contentReferenceSchema,
          meaning: contentReferenceSchema,
          pronunciation: contentReferenceSchema,
          contextMeaningKo: z.string().min(1),
          representative: z.boolean().optional(),
        })
        .strict(),
    ),
  })
  .strict();

const generatedOptionSchema = z.union([
  z
    .object({
      clientRef: z.string().trim().min(1),
      position: nonnegativeIntegerSchema,
      sentence: generatedSentenceSchema,
      span: z.null(),
    })
    .strict(),
  z
    .object({
      clientRef: z.string().trim().min(1),
      position: nonnegativeIntegerSchema,
      sentence: z.null(),
      span: z
        .object({
          blockPosition: nonnegativeIntegerSchema,
          sentencePosition: nonnegativeIntegerSchema,
          startTokenIndex: nonnegativeIntegerSchema,
          endTokenIndex: positiveIntegerSchema,
        })
        .strict(),
    })
    .strict(),
]);

/** provider·prompt 원문을 제외한 canonical AI 문제 후보 payload */
export const questionCandidatePayloadSchema = z
  .object({
    questionTypeSlug: z.string().trim().min(1),
    questionTypeVersion: positiveIntegerSchema,
    difficulty: difficultySchema,
    topicSlug: z.string().trim().min(1),
    tagSlugs: z.array(z.string().trim().min(1)),
    blocks: z.array(
      z
        .object({
          kind: z.enum([
            'INSTRUCTION',
            'PASSAGE',
            'DIALOGUE',
            'QUESTION',
            'EXPLANATION',
          ]),
          displayMode: z.enum([
            'TEXT',
            'AUDIO',
            'TEXT_AND_AUDIO',
            'AUDIO_THEN_REVEAL',
          ]),
          sentences: z.array(
            z
              .object({
                speaker: z
                  .string()
                  .refine(
                    (value) => value.trim().length > 0,
                    'speaker는 비어 있지 않아야 합니다.',
                  )
                  .nullable(),
                sentence: generatedSentenceSchema,
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    options: z.array(generatedOptionSchema),
    correctOptionRef: z.string().trim().min(1),
  })
  .strict();

/** 후보 검증에서 원문 없이 관리자에게 보여줄 안전한 근거 */
export const questionCandidateValidationEvidenceSchema = z.union([
  z.object({ kind: z.literal('NONE') }).strict(),
  z
    .object({
      kind: z.literal('SIMILARITY_MATCHES'),
      matches: z
        .array(
          z
            .object({
              questionVersionId: uuidSchema,
              score: z.number().finite().min(0).max(1),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('RETRYABLE_PROVIDER_FAILURE'),
      retryable: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal('CROSS_VALIDATION'),
      summary: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);

const questionCandidateReviewBaseShape = {
  code: z.string().min(1).nullable(),
  revision: nonnegativeIntegerSchema,
  regeneratedFromCandidateId: uuidSchema.nullable(),
};

/** 후보의 승인 결과를 포함하되 검수자 식별자는 제외한 공개 상태 */
export const questionCandidateReviewStateSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        ...questionCandidateReviewBaseShape,
        status: z.literal('PENDING'),
        approvedQuestionId: z.null(),
        approvedQuestionVersionId: z.null(),
      })
      .strict(),
    z
      .object({
        ...questionCandidateReviewBaseShape,
        status: z.literal('DISCARDED'),
        approvedQuestionId: z.null(),
        approvedQuestionVersionId: z.null(),
      })
      .strict(),
    z
      .object({
        ...questionCandidateReviewBaseShape,
        status: z.literal('APPROVED'),
        approvedQuestionId: uuidSchema,
        approvedQuestionVersionId: uuidSchema,
      })
      .strict(),
  ],
);

const questionCandidateSummaryBaseShape = {
  id: uuidSchema,
  jobId: uuidSchema,
  jobItemId: uuidSchema,
  jobAttempt: nonnegativeIntegerSchema,
  ordinal: nonnegativeIntegerSchema,
  questionTypeVersionId: uuidSchema,
  resultGroup: questionCandidateGroupSchema,
  review: questionCandidateReviewStateSchema,
  createdAt: utcDateTimeSchema,
  updatedAt: utcDateTimeSchema,
};

const canonicalQuestionCandidateSummarySchema = z
  .object({
    ...questionCandidateSummaryBaseShape,
    payloadState: z.literal('CANONICAL'),
    topicId: uuidSchema,
    difficulty: difficultySchema,
  })
  .strict();

const redactedQuestionCandidateSummarySchema = z
  .object({
    ...questionCandidateSummaryBaseShape,
    payloadState: z.literal('REDACTED_INVALID'),
    topicId: z.null(),
    difficulty: z.null(),
    resultGroup: z.literal('FAILED'),
    review: questionCandidateReviewStateSchema.refine(
      ({ status }) => status !== 'APPROVED',
      'redacted 후보는 승인 상태일 수 없습니다.',
    ),
  })
  .strict();

const questionCandidateSummarySchema = z.discriminatedUnion('payloadState', [
  canonicalQuestionCandidateSummarySchema,
  redactedQuestionCandidateSummarySchema,
]);

/** 후보 목록에 사용하는 page query와 안정적인 필터 */
export const questionCandidateListQuerySchema = z
  .object({
    jobId: uuidSchema.optional(),
    jobItemId: uuidSchema.optional(),
    resultGroup: questionCandidateGroupSchema.optional(),
    reviewStatus: questionCandidateReviewStatusSchema.optional(),
    page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpIntegerSchema(1, 100).default(20),
  })
  .strict();

/** 후보 단건·승인·폐기·재생성 경로의 UUID parameter */
export const questionCandidatePathSchema = z
  .object({ candidateId: uuidSchema })
  .strict();

/** 비공개 payload와 actor 없이 후보 상태를 반환하는 목록 항목 */
export const questionCandidateListItemSchema = questionCandidateSummarySchema;

/** 관리자 후보 목록의 page 응답 */
export const questionCandidateListResponseSchema = z
  .object({
    items: z.array(questionCandidateListItemSchema),
    page: z
      .object({
        page: positiveIntegerSchema,
        pageSize: z.number().int().safe().min(1).max(100),
        totalItems: nonnegativeIntegerSchema,
        totalPages: nonnegativeIntegerSchema,
      })
      .strict(),
  })
  .strict();

/** 한 후보의 canonical graph와 검수 상태를 반환하는 공개 상세 */
export const questionCandidateDetailSchema = z.discriminatedUnion(
  'payloadState',
  [
    canonicalQuestionCandidateSummarySchema
      .extend({
        tagIds: z.array(uuidSchema),
        payload: questionCandidatePayloadSchema,
      })
      .strict(),
    redactedQuestionCandidateSummarySchema
      .extend({
        tagIds: z.tuple([]),
        payload: z.null(),
      })
      .strict(),
  ],
);

/** 후보의 단계별 안전한 검증 evidence */
export const questionCandidateValidationSchema = z
  .object({
    stage: questionCandidateValidationStageSchema,
    status: questionCandidateValidationStatusSchema,
    code: z.string().min(1).nullable(),
    evidence: questionCandidateValidationEvidenceSchema,
    createdAt: utcDateTimeSchema,
  })
  .strict()
  .superRefine((validation, context) => {
    const addIssue = (message: string) =>
      context.addIssue({
        code: 'custom',
        message,
        path: ['evidence'],
      });

    if (
      (validation.status === 'PASSED' && validation.code !== null) ||
      (validation.status === 'FAILED' && validation.code === null) ||
      (validation.status === 'SKIPPED' &&
        validation.code !== 'QUESTION_VALIDATION_SKIPPED')
    ) {
      context.addIssue({
        code: 'custom',
        message: '검증 결과와 stable code 존재 여부가 일치해야 합니다.',
        path: ['code'],
      });
    }

    if (
      (validation.stage === 'SCHEMA' || validation.stage === 'DECISION_RULE') &&
      validation.evidence.kind !== 'NONE'
    ) {
      addIssue('schema·결정 규칙 검증은 원문 없는 NONE evidence만 사용합니다.');
      return;
    }

    if (validation.status === 'SKIPPED') {
      if (validation.evidence.kind !== 'NONE') {
        addIssue('실행하지 않은 검증은 원문 없는 NONE evidence만 사용합니다.');
      }
      return;
    }

    if (validation.stage === 'SIMILARITY') {
      if (
        (validation.status === 'PASSED' &&
          validation.evidence.kind !== 'NONE') ||
        (validation.status === 'FAILED' &&
          !['NONE', 'SIMILARITY_MATCHES'].includes(validation.evidence.kind))
      ) {
        addIssue(
          '유사도 검증은 NONE 또는 SIMILARITY_MATCHES evidence만 사용합니다.',
        );
      }
      return;
    }

    if (
      (validation.status === 'PASSED' &&
        !['NONE', 'CROSS_VALIDATION'].includes(validation.evidence.kind)) ||
      (validation.status === 'FAILED' &&
        !['NONE', 'CROSS_VALIDATION', 'RETRYABLE_PROVIDER_FAILURE'].includes(
          validation.evidence.kind,
        ))
    ) {
      addIssue(
        'AI 교차 검증은 상태에 맞는 NONE·CROSS_VALIDATION·RETRYABLE_PROVIDER_FAILURE evidence만 사용합니다.',
      );
    }
  });

const allValidationStages = new Set([
  'SCHEMA',
  'DECISION_RULE',
  'SIMILARITY',
  'AI_CROSS_VALIDATION',
]);

/** canonical 후보·검증 evidence·검수 상태만 노출하는 상세 응답 */
export const questionCandidateDetailResponseSchema = z
  .object({
    candidate: questionCandidateDetailSchema,
    validations: z.array(questionCandidateValidationSchema).length(4),
  })
  .strict()
  .superRefine((detail, context) => {
    const stages = new Set(detail.validations.map(({ stage }) => stage));
    if (stages.size !== allValidationStages.size) {
      context.addIssue({
        code: 'custom',
        message: '후보 상세에는 네 검증 단계가 각각 하나씩 있어야 합니다.',
        path: ['validations'],
      });
    }
  });

const questionCandidateReviewRequestSchema = z
  .object({
    expectedRevision: nonnegativeIntegerSchema,
    requestId: uuidSchema,
  })
  .strict();

/** 후보 승인의 optimistic revision·멱등 request 입력 */
export const approveQuestionCandidateRequestSchema =
  questionCandidateReviewRequestSchema;

/** 후보 폐기의 optimistic revision·멱등 request 입력 */
export const discardQuestionCandidateRequestSchema =
  questionCandidateReviewRequestSchema;

/** 후보 재생성 요청의 optimistic revision·멱등 request 입력 */
export const regenerateQuestionCandidateRequestSchema =
  questionCandidateReviewRequestSchema;

/** 승인된 후보가 만든 게시 전 문제 DRAFT 응답 */
export const approveQuestionCandidateResponseSchema = z
  .object({
    candidateId: uuidSchema,
    review: z
      .object({
        status: z.literal('APPROVED'),
        revision: nonnegativeIntegerSchema,
        questionId: uuidSchema,
        questionVersionId: uuidSchema,
      })
      .strict(),
  })
  .strict();

/** 폐기 완료 뒤의 terminal 후보 상태 응답 */
export const discardQuestionCandidateResponseSchema = z
  .object({
    candidateId: uuidSchema,
    review: z
      .object({
        status: z.literal('DISCARDED'),
        revision: nonnegativeIntegerSchema,
      })
      .strict(),
  })
  .strict();

/** 원본 후보를 보존한 새 item attempt 접수 응답 */
export const regenerateQuestionCandidateResponseSchema = z
  .object({
    candidateId: uuidSchema,
    jobId: uuidSchema,
    attempt: positiveIntegerSchema,
    revision: nonnegativeIntegerSchema,
  })
  .strict();

/** 검증된 후보 목록 query type */
export type QuestionCandidateListQuery = z.infer<
  typeof questionCandidateListQuerySchema
>;

/** 검증된 후보 목록 응답 type */
export type QuestionCandidateListResponse = z.infer<
  typeof questionCandidateListResponseSchema
>;

/** 검증된 후보 목록 항목 type */
export type QuestionCandidateListItem = z.infer<
  typeof questionCandidateListItemSchema
>;

/** 검증된 후보 경로 type */
export type QuestionCandidatePath = z.infer<typeof questionCandidatePathSchema>;

/** 안전한 canonical 후보 payload type */
export type QuestionCandidatePayload = z.infer<
  typeof questionCandidatePayloadSchema
>;

/** 검증된 후보 상세 응답 type */
export type QuestionCandidateDetailResponse = z.infer<
  typeof questionCandidateDetailResponseSchema
>;

/** 검증된 후보 승인 요청 type */
export type ApproveQuestionCandidateRequest = z.infer<
  typeof approveQuestionCandidateRequestSchema
>;

/** 검증된 후보 폐기 요청 type */
export type DiscardQuestionCandidateRequest = z.infer<
  typeof discardQuestionCandidateRequestSchema
>;

/** 검증된 후보 재생성 요청 type */
export type RegenerateQuestionCandidateRequest = z.infer<
  typeof regenerateQuestionCandidateRequestSchema
>;

/** 후보 승인 응답 type */
export type ApproveQuestionCandidateResponse = z.infer<
  typeof approveQuestionCandidateResponseSchema
>;

/** 후보 폐기 응답 type */
export type DiscardQuestionCandidateResponse = z.infer<
  typeof discardQuestionCandidateResponseSchema
>;

/** 후보 재생성 응답 type */
export type RegenerateQuestionCandidateResponse = z.infer<
  typeof regenerateQuestionCandidateResponseSchema
>;
