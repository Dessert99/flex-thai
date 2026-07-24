/** 관리자 문제의 모든 상태 조회·초안 교체·검증 공개 계약을 정의한다 */
import { z } from 'zod';
import { pageMetadataSchema } from '../learning/questions.js';
import { canonicalQuestionVersionInputSchema } from './content-imports.js';

const uuidSchema = z.uuid();
const utcDateTimeSchema = z.string().datetime();
const positiveIntegerSchema = z.number().int().safe().positive();
const difficultySchema = z.number().int().safe().min(1).max(5);
const questionStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']);
const questionVersionStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'RETIRED',
  'INVALIDATED',
]);
const questionValidationStatusSchema = z.enum(['PENDING', 'PASSED', 'FAILED']);

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

/** 모든 문제·버전·검증 상태를 찾는 관리자 페이지 query */
export const adminQuestionListQuerySchema = z
  .object({
    status: questionStatusSchema.optional(),
    versionStatus: questionVersionStatusSchema.optional(),
    validationStatus: questionValidationStatusSchema.optional(),
    questionTypeSlug: z.string().trim().min(1).optional(),
    skill: z.enum(['READING', 'LISTENING']).optional(),
    difficulty: httpIntegerSchema(1, 5).optional(),
    page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpIntegerSchema(1, 100).default(20),
  })
  .strict();

/** 문제 단건·복제·숨김·복구 경로의 UUID parameter */
export const adminQuestionIdPathSchema = z
  .object({ questionId: uuidSchema })
  .strict();

/** 문제 버전 교체·검증·게시·무효화 경로의 UUID parameter */
export const adminQuestionVersionIdPathSchema = z
  .object({ versionId: uuidSchema })
  .strict();

const adminContentReferenceSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

const adminQuestionTokenInputSchema = z
  .object({
    surface: z.string().min(1),
    startOffset: z.number().int().safe().nonnegative(),
    endOffset: positiveIntegerSchema,
    vocabulary: adminContentReferenceSchema,
    meaning: adminContentReferenceSchema,
    pronunciation: adminContentReferenceSchema,
    contextMeaningKo: z.string().min(1),
    role: z.enum(['TARGET', 'REQUIRED', 'SUPPORTING']),
  })
  .strict();

const adminQuestionExpressionInputSchema = z
  .object({
    startTokenIndex: z.number().int().safe().nonnegative(),
    endTokenIndex: positiveIntegerSchema,
    vocabulary: adminContentReferenceSchema,
    representative: z.boolean().optional(),
  })
  .strict();

const adminQuestionSentenceInputSchema = z
  .object({
    originalText: z.string().min(1),
    translationKo: z.string().min(1),
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
    mediaAssetId: uuidSchema,
    tokens: z.array(adminQuestionTokenInputSchema),
    expressions: z.array(adminQuestionExpressionInputSchema),
  })
  .strict();

const adminQuestionBlockInputSchema = z
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
    sentences: z
      .array(
        z
          .object({
            speaker: z.string().min(1).nullable().optional(),
            sentence: adminQuestionSentenceInputSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const adminQuestionOptionInputSchema = z
  .object({
    clientRef: z.string().min(1),
    position: z.number().int().safe().nonnegative(),
    sentence: adminQuestionSentenceInputSchema,
  })
  .strict();

/** 초안 문제 버전을 기존 콘텐츠 UUID 전용 canonical 구조로 전체 교체하는 요청 */
export const adminQuestionVersionPayloadSchema = z
  .object({
    questionTypeSlug: z.string().min(1),
    questionTypeVersion: positiveIntegerSchema,
    difficulty: difficultySchema,
    blocks: z.array(adminQuestionBlockInputSchema).min(1),
    options: z.array(adminQuestionOptionInputSchema).min(1),
    correctOptionRef: z.string().min(1),
  })
  .strict()
  .superRefine((payload, context) => {
    // import와 공유하는 offset·option 관계 규칙은 한 원본에서 검증한다.
    const result = canonicalQuestionVersionInputSchema.safeParse(payload);
    if (!result.success) {
      result.error.issues.forEach((issue) =>
        context.addIssue({
          code: 'custom',
          message: issue.message,
          path: issue.path,
        }),
      );
    }
  });

const questionValidationIssueSchema = z
  .object({
    path: z.string(),
    code: z.enum([
      'DIFFICULTY_INVALID',
      'BLOCK_POSITION_INVALID',
      'OPTION_POSITION_INVALID',
      'OPTION_COUNT_INVALID',
      'CORRECT_OPTION_COUNT_INVALID',
      'QUESTION_TEMPLATE_INVALID',
      'DIALOGUE_SPEAKER_REQUIRED',
      'THAI_CONTENT_INVALID',
      'VOCABULARY_NOT_PUBLISHED',
      'MEDIA_ASSET_NOT_READY',
    ]),
  })
  .strict();

/** 검증 실패를 HTTP 실패로 바꾸지 않는 결정 규칙 보고서 */
export const adminQuestionValidationReportSchema = z
  .object({
    status: z.enum(['PASSED', 'FAILED']),
    issues: z.array(questionValidationIssueSchema),
  })
  .strict()
  .superRefine((report, context) => {
    if (
      (report.status === 'PASSED' && report.issues.length !== 0) ||
      (report.status === 'FAILED' && report.issues.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        message: '검증 상태와 issue 존재 여부가 일치해야 합니다.',
        path: ['issues'],
      });
    }
  });

/** 새 문제 버전 생성과 초안 교체가 반환하는 버전 요약 */
export const adminQuestionVersionResponseSchema = z
  .object({
    questionId: uuidSchema,
    versionId: uuidSchema,
    version: positiveIntegerSchema,
    status: z.literal('DRAFT'),
    validationStatus: z.literal('PENDING'),
  })
  .strict();

const adminQuestionListItemSchema = z
  .object({
    questionId: uuidSchema,
    status: questionStatusSchema,
    currentPublishedVersionId: uuidSchema.nullable(),
    latestVersion: positiveIntegerSchema,
    latestVersionId: uuidSchema,
    latestVersionStatus: questionVersionStatusSchema,
    validationStatus: questionValidationStatusSchema,
    questionTypeSlug: z.string().min(1),
    difficulty: difficultySchema,
    updatedAt: utcDateTimeSchema,
  })
  .strict();

/** 모든 상태의 관리자 문제 목록 페이지 응답 */
export const adminQuestionListResponseSchema = z
  .object({
    items: z.array(adminQuestionListItemSchema),
    page: pageMetadataSchema,
  })
  .strict();

const adminQuestionTypeVersionSchema = z
  .object({
    id: uuidSchema,
    slug: z.string().min(1),
    version: positiveIntegerSchema,
    skill: z.enum(['READING', 'LISTENING']),
    template: z.enum(['STANDARD_CHOICE', 'PASSAGE_CHOICE', 'DIALOGUE_CHOICE']),
  })
  .strict();

const adminQuestionBlockSchema = z
  .object({
    id: uuidSchema,
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
    position: z.number().int().safe().nonnegative(),
    sentences: z.array(
      z
        .object({
          position: z.number().int().safe().nonnegative(),
          speaker: z.string().min(1).nullable(),
          sentenceVersionId: uuidSchema,
        })
        .strict(),
    ),
  })
  .strict();

const adminQuestionOptionSchema = z
  .object({
    id: uuidSchema,
    position: z.number().int().safe().nonnegative(),
    sentenceVersionId: uuidSchema,
  })
  .strict();

const adminQuestionValidationStateSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('PENDING'),
      issues: z.tuple([]),
      validatedAt: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal('PASSED'),
      issues: z.tuple([]),
      validatedAt: utcDateTimeSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('FAILED'),
      issues: z.array(questionValidationIssueSchema).min(1),
      validatedAt: utcDateTimeSchema,
    })
    .strict(),
]);

const adminQuestionVersionDetailSchema = z
  .object({
    id: uuidSchema,
    version: positiveIntegerSchema,
    status: questionVersionStatusSchema,
    validation: adminQuestionValidationStateSchema,
    questionType: adminQuestionTypeVersionSchema,
    difficulty: difficultySchema,
    blocks: z.array(adminQuestionBlockSchema),
    options: z.array(adminQuestionOptionSchema),
    correctOptionId: uuidSchema,
    createdAt: utcDateTimeSchema,
    publishedAt: utcDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((version, context) => {
    const correctMatches = version.options.filter(
      ({ id }) => id === version.correctOptionId,
    );
    if (correctMatches.length !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'correctOptionId는 해당 버전 선택지 하나를 가리켜야 합니다.',
        path: ['correctOptionId'],
      });
    }
  });

/** 문제의 모든 버전·검증·정답 option ID를 공개하는 관리자 상세 */
export const adminQuestionDetailResponseSchema = z
  .object({
    questionId: uuidSchema,
    status: questionStatusSchema,
    currentPublishedVersionId: uuidSchema.nullable(),
    versions: z.array(adminQuestionVersionDetailSchema),
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  })
  .strict();

/** 검증된 관리자 문제 목록 query type */
export type AdminQuestionListQuery = z.infer<
  typeof adminQuestionListQuerySchema
>;

/** 검증된 관리자 문제 UUID path type */
export type AdminQuestionIdPath = z.infer<typeof adminQuestionIdPathSchema>;

/** 검증된 관리자 문제 버전 UUID path type */
export type AdminQuestionVersionIdPath = z.infer<
  typeof adminQuestionVersionIdPathSchema
>;

/** canonical 관리자 문제 버전 교체 요청 type */
export type AdminQuestionVersionPayload = z.infer<
  typeof adminQuestionVersionPayloadSchema
>;

/** 생성·교체된 관리자 문제 버전 요약 응답 type */
export type AdminQuestionVersionResponse = z.infer<
  typeof adminQuestionVersionResponseSchema
>;

/** 관리자 문제 결정 규칙 검증 보고서 type */
export type AdminQuestionValidationReport = z.infer<
  typeof adminQuestionValidationReportSchema
>;

/** 관리자 문제 목록 응답 type */
export type AdminQuestionListResponse = z.infer<
  typeof adminQuestionListResponseSchema
>;

/** 관리자 문제 상세 응답 type */
export type AdminQuestionDetailResponse = z.infer<
  typeof adminQuestionDetailResponseSchema
>;
