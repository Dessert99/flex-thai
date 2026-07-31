/** AI 어휘 후보 조회·승인·폐기의 공개 JSON 경계를 정의한다 */
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

/** 후보의 관리자 검수 lifecycle 상태 */
export const vocabularyCandidateReviewStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'DISCARDED',
]);

/** 후보 승인으로 남기는 resolution 종류 */
export const vocabularyCandidateResolutionKindSchema = z.enum([
  'DRAFT_CREATED',
  'EXISTING_LINKED',
]);

/** AI가 판정한 기존 어휘 중복 분류 */
export const vocabularyCandidateClassificationSchema = z.enum([
  'NEW_VOCABULARY',
  'EXACT_EXISTING_MEANING',
  'EXACT_NEW_MEANING',
  'POSSIBLE_DUPLICATE',
]);

/** 후보 검토 우선순위 그룹 */
export const vocabularyCandidateGroupSchema = z.enum([
  'NORMAL',
  'NEEDS_ATTENTION',
  'FAILED',
]);

/** 후보의 검증 단계 */
export const vocabularyCandidateValidationStageSchema = z.enum([
  'SCHEMA',
  'DECISION_RULE',
  'AI_CROSS_VALIDATION',
]);

/** 후보 검증 결과 */
export const vocabularyCandidateValidationStatusSchema = z.enum([
  'PASSED',
  'FAILED',
]);

/** 후보 검수 실패를 공개 problem으로 변환할 stable code */
export const vocabularyCandidateReviewErrorCodeSchema = z.enum([
  'VOCABULARY_CANDIDATE_NOT_FOUND',
  'VOCABULARY_CANDIDATE_NOT_APPROVABLE',
  'VOCABULARY_CANDIDATE_DUPLICATE_CONFIRMATION_REQUIRED',
  'VOCABULARY_CANDIDATE_IDEMPOTENCY_CONFLICT',
  'VOCABULARY_CANDIDATE_REVIEW_CONFLICT',
  'VOCABULARY_CANDIDATE_EXISTING_VOCABULARY_NOT_FOUND',
  'VOCABULARY_CANDIDATE_AUDIO_NOT_READY',
]);

const vocabularyMeaningSnapshotSchema = z
  .object({
    meaningKo: z.string().trim().min(1),
    partOfSpeech: z.string().trim().min(1),
    difficulty: difficultySchema,
  })
  .strict();

const vocabularyDraftMeaningSchema = vocabularyMeaningSnapshotSchema
  .extend({
    clientRef: z.string().trim().min(1),
    contextNote: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

const vocabularyDraftPronunciationSchema = z
  .object({
    clientRef: z.string().trim().min(1),
    pronunciationKo: z.string().trim().min(1),
    toneMarks: z.string(),
    mediaAssetId: uuidSchema,
  })
  .strict();

const vocabularyMeaningPronunciationSchema = z
  .object({
    meaningRef: z.string().trim().min(1),
    pronunciationRef: z.string().trim().min(1),
  })
  .strict();

const assertCompleteDraftGraph = (
  graph: {
    meanings: Array<{ clientRef: string }>;
    pronunciations: Array<{ clientRef: string }>;
    meaningPronunciations: Array<{
      meaningRef: string;
      pronunciationRef: string;
    }>;
  },
  context: z.RefinementCtx,
) => {
  const meaningRefs = graph.meanings.map(({ clientRef }) => clientRef);
  const pronunciationRefs = graph.pronunciations.map(
    ({ clientRef }) => clientRef,
  );
  const duplicateRef = [...meaningRefs, ...pronunciationRefs].find(
    (reference, index, references) =>
      references.indexOf(reference) !== index,
  );
  if (duplicateRef) {
    context.addIssue({
      code: 'custom',
      message: '뜻과 발음 clientRef는 graph 전체에서 유일해야 합니다.',
      path: ['meanings'],
    });
  }

  const knownMeanings = new Set(meaningRefs);
  const knownPronunciations = new Set(pronunciationRefs);
  const pairs = new Set<string>();
  graph.meaningPronunciations.forEach((mapping, index) => {
    const pair = `${mapping.meaningRef}:${mapping.pronunciationRef}`;
    if (pairs.has(pair)) {
      context.addIssue({
        code: 'custom',
        message: '뜻과 발음 mapping은 중복될 수 없습니다.',
        path: ['meaningPronunciations', index],
      });
    }
    pairs.add(pair);
    if (!knownMeanings.has(mapping.meaningRef)) {
      context.addIssue({
        code: 'custom',
        message: 'mapping은 존재하는 뜻만 참조해야 합니다.',
        path: ['meaningPronunciations', index, 'meaningRef'],
      });
    }
    if (!knownPronunciations.has(mapping.pronunciationRef)) {
      context.addIssue({
        code: 'custom',
        message: 'mapping은 존재하는 발음만 참조해야 합니다.',
        path: ['meaningPronunciations', index, 'pronunciationRef'],
      });
    }
  });

  for (const meaningRef of meaningRefs) {
    if (
      !graph.meaningPronunciations.some(
        (mapping) => mapping.meaningRef === meaningRef,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: '모든 뜻은 하나 이상의 발음과 연결되어야 합니다.',
        path: ['meaningPronunciations'],
      });
    }
  }
  for (const pronunciationRef of pronunciationRefs) {
    if (
      !graph.meaningPronunciations.some(
        (mapping) => mapping.pronunciationRef === pronunciationRef,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: '모든 발음은 하나 이상의 뜻과 연결되어야 합니다.',
        path: ['meaningPronunciations'],
      });
    }
  }
};

const createDraftApprovalSchema = z
  .object({
    action: z.literal('CREATE_DRAFT'),
    expectedRevision: nonnegativeIntegerSchema,
    requestId: uuidSchema,
    thai: z.string().trim().min(1),
    kind: z.enum(['WORD', 'EXPRESSION']),
    meanings: z.array(vocabularyDraftMeaningSchema).min(1),
    pronunciations: z.array(vocabularyDraftPronunciationSchema).min(1),
    meaningPronunciations: z
      .array(vocabularyMeaningPronunciationSchema)
      .min(1),
    confirmDuplicate: z.literal(true).optional(),
  })
  .strict()
  .superRefine(assertCompleteDraftGraph);

const linkExistingApprovalSchema = z
  .object({
    action: z.literal('LINK_EXISTING'),
    expectedRevision: nonnegativeIntegerSchema,
    requestId: uuidSchema,
    vocabularyId: uuidSchema,
  })
  .strict();

/** action별로 완전한 DRAFT graph 또는 기존 어휘 ID를 받는 승인 요청 */
export const vocabularyCandidateApproveRequestSchema = z.discriminatedUnion(
  'action',
  [createDraftApprovalSchema, linkExistingApprovalSchema],
);

/** optimistic revision과 멱등 ID를 받는 후보 폐기 요청 */
export const vocabularyCandidateDiscardRequestSchema = z
  .object({
    expectedRevision: nonnegativeIntegerSchema,
    requestId: uuidSchema,
  })
  .strict();

/** 후보 단건·승인·폐기 경로의 UUID parameter */
export const vocabularyCandidatePathSchema = z
  .object({ candidateId: uuidSchema })
  .strict();

/** 후보 목록의 상태·job filter와 page query */
export const vocabularyCandidateListQuerySchema = z
  .object({
    jobId: uuidSchema.optional(),
    reviewStatus: vocabularyCandidateReviewStatusSchema.optional(),
    page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpIntegerSchema(1, 100).default(20),
  })
  .strict();

const vocabularyCandidateResolutionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('DRAFT_CREATED'),
      vocabularyId: uuidSchema,
      versionId: uuidSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('EXISTING_LINKED'),
      vocabularyId: uuidSchema,
    })
    .strict(),
]);

const vocabularyCandidateReviewStateSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('PENDING'),
      revision: nonnegativeIntegerSchema,
      resolution: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal('DISCARDED'),
      revision: nonnegativeIntegerSchema,
      resolution: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal('APPROVED'),
      revision: positiveIntegerSchema,
      resolution: vocabularyCandidateResolutionSchema,
    })
    .strict(),
]);

const suspectedVocabularyMatchSchema = z
  .object({
    vocabularyId: uuidSchema,
    normalizedThai: z.string().min(1),
    codePointDistance: nonnegativeIntegerSchema,
  })
  .strict();

/** private provider 실행 정보를 제외한 후보 목록 항목 */
export const vocabularyCandidateListItemSchema = z
  .object({
    id: uuidSchema,
    jobId: uuidSchema,
    jobItemId: uuidSchema,
    jobAttempt: nonnegativeIntegerSchema,
    ordinal: nonnegativeIntegerSchema,
    thai: z.string().min(1),
    kind: z.enum(['WORD', 'EXPRESSION']),
    meanings: z.array(vocabularyMeaningSnapshotSchema).min(1),
    classification: vocabularyCandidateClassificationSchema,
    resultGroup: vocabularyCandidateGroupSchema,
    matchedVocabularyId: uuidSchema.nullable(),
    suspectedMatches: z.array(suspectedVocabularyMatchSchema),
    review: vocabularyCandidateReviewStateSchema,
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  })
  .strict();

/** AI 어휘 후보 page 응답 */
export const vocabularyCandidateListResponseSchema = z
  .object({
    items: z.array(vocabularyCandidateListItemSchema),
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

/** raw details를 제외한 후보 검증 결과 */
export const vocabularyCandidateValidationSchema = z
  .object({
    stage: vocabularyCandidateValidationStageSchema,
    status: vocabularyCandidateValidationStatusSchema,
    code: z.string().min(1).nullable(),
    evidence: z.record(z.string(), z.unknown()),
    createdAt: utcDateTimeSchema,
  })
  .strict();

/** 후보 snapshot과 ordinal 검증 결과를 반환하는 상세 응답 */
export const vocabularyCandidateDetailResponseSchema = z
  .object({
    candidate: vocabularyCandidateListItemSchema,
    validations: z.array(vocabularyCandidateValidationSchema),
  })
  .strict();

/** 승인 결과의 terminal resolution 응답 */
export const vocabularyCandidateApproveResponseSchema = z
  .object({
    candidateId: uuidSchema,
    reviewStatus: z.literal('APPROVED'),
    revision: positiveIntegerSchema,
    resolution: vocabularyCandidateResolutionSchema,
  })
  .strict();

/** 폐기 결과의 terminal 상태 응답 */
export const vocabularyCandidateDiscardResponseSchema = z
  .object({
    candidateId: uuidSchema,
    reviewStatus: z.literal('DISCARDED'),
    revision: positiveIntegerSchema,
  })
  .strict();

/** 검증된 후보 목록 query type */
export type VocabularyCandidateListQuery = z.infer<
  typeof vocabularyCandidateListQuerySchema
>;

/** 검증된 후보 목록 응답 type */
export type VocabularyCandidateListResponse = z.infer<
  typeof vocabularyCandidateListResponseSchema
>;

/** 검증된 후보 상세 응답 type */
export type VocabularyCandidateDetailResponse = z.infer<
  typeof vocabularyCandidateDetailResponseSchema
>;

/** 검증된 후보 승인 요청 type */
export type VocabularyCandidateApproveRequest = z.infer<
  typeof vocabularyCandidateApproveRequestSchema
>;

/** 검증된 후보 폐기 요청 type */
export type VocabularyCandidateDiscardRequest = z.infer<
  typeof vocabularyCandidateDiscardRequestSchema
>;

/** 검증된 후보 승인 응답 type */
export type VocabularyCandidateApproveResponse = z.infer<
  typeof vocabularyCandidateApproveResponseSchema
>;

/** 검증된 후보 폐기 응답 type */
export type VocabularyCandidateDiscardResponse = z.infer<
  typeof vocabularyCandidateDiscardResponseSchema
>;
