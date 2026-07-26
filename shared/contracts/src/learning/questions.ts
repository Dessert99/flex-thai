/** 학습자 문제 조회·답안 제출의 정답 비노출 공개 JSON 계약을 정의한다 */
import { z } from 'zod';
import { publicThaiSentenceSchema } from '../thai-content/sentences.js';

const uuidSchema = z.uuid();
const nonnegativeSafeIntegerSchema = z.number().safe().nonnegative();
const positiveSafeIntegerSchema = z.number().safe().positive();
const difficultySchema = z.number().safe().min(1).max(5);
const positionSchema = nonnegativeSafeIntegerSchema;
const utcDateTimeSchema = z.string().datetime();

const httpIntegerSchema = (minimum: number, maximum: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/u)
        .transform((value) => Number(value)),
    ])
    .pipe(z.number().safe().min(minimum).max(maximum));

const httpBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

const pageQueryShape = {
  page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
  pageSize: httpIntegerSchema(1, 100).default(20),
};

const questionSkillSchema = z.enum(['READING', 'LISTENING']);
const firstResultSchema = z.enum(['CORRECT', 'INCORRECT', 'UNANSWERED']);
const questionTemplateSchema = z.enum([
  'STANDARD_CHOICE',
  'PASSAGE_CHOICE',
  'DIALOGUE_CHOICE',
  'INLINE_SPAN_CHOICE',
]);
const questionDisplayModeSchema = z.enum([
  'TEXT',
  'AUDIO',
  'TEXT_AND_AUDIO',
  'AUDIO_THEN_REVEAL',
]);
const publicQuestionBlockKindSchema = z.enum([
  'INSTRUCTION',
  'PASSAGE',
  'DIALOGUE',
  'QUESTION',
]);

const questionTypeSchema = z
  .object({
    id: uuidSchema,
    slug: z.string().min(1),
    displayName: z.string().min(1),
  })
  .strict();

const questionBlockSentenceSchema = z
  .object({
    position: positionSchema,
    speaker: z.string().min(1).nullable(),
    sentence: publicThaiSentenceSchema,
  })
  .strict();

const publicQuestionBlockSchema = z
  .object({
    id: uuidSchema,
    kind: publicQuestionBlockKindSchema,
    displayMode: questionDisplayModeSchema,
    position: positionSchema,
    sentences: z.array(questionBlockSentenceSchema),
  })
  .strict();

const explanationBlockSchema = z
  .object({
    id: uuidSchema,
    kind: z.literal('EXPLANATION'),
    displayMode: questionDisplayModeSchema,
    position: positionSchema,
    sentences: z.array(questionBlockSentenceSchema),
  })
  .strict();

/** 문장 token 범위에 연결된 inline 선택지 계약 */
export const questionOptionSpanSchema = z
  .object({
    sentenceVersionId: uuidSchema,
    startTokenIndex: positionSchema,
    endTokenIndex: positiveSafeIntegerSchema,
  })
  .strict();

const questionOptionBaseShape = {
  id: uuidSchema,
  position: positionSchema,
};

const questionOptionSchema = z.union([
  z
    .object({
      ...questionOptionBaseShape,
      sentence: publicThaiSentenceSchema,
      span: z.null(),
    })
    .strict(),
  z
    .object({
      ...questionOptionBaseShape,
      sentence: z.null(),
      span: questionOptionSpanSchema,
    })
    .strict(),
]);

/** 페이지 번호 방식의 공통 응답 metadata */
export const pageMetadataSchema = z
  .object({
    page: positiveSafeIntegerSchema,
    pageSize: z.number().safe().min(1).max(100),
    totalItems: nonnegativeSafeIntegerSchema,
    totalPages: nonnegativeSafeIntegerSchema,
  })
  .strict();

/** 학습자 문제 목록의 필터와 페이지 query */
export const questionListQuerySchema = z
  .object({
    skill: questionSkillSchema.optional(),
    questionTypeId: uuidSchema.optional(),
    difficulty: httpIntegerSchema(1, 5).optional(),
    saved: httpBooleanSchema.optional(),
    firstResult: firstResultSchema.optional(),
    ...pageQueryShape,
  })
  .strict();

/** 문제 목록과 관련 문제 페이지가 공유하는 정답 없는 문제 요약 */
export const questionListItemSchema = z
  .object({
    questionId: uuidSchema,
    questionVersionId: uuidSchema,
    questionType: questionTypeSchema,
    skill: questionSkillSchema,
    difficulty: difficultySchema,
    saved: z.boolean(),
    firstResult: firstResultSchema,
  })
  .strict();

/** 현재 게시 문제의 정답 없는 페이지 응답 */
export const questionListResponseSchema = z
  .object({
    items: z.array(questionListItemSchema),
    page: pageMetadataSchema,
  })
  .strict();

/** 현재 게시 버전의 공개 블록·선택지·문장 피드백 응답 */
export const questionDetailResponseSchema = z
  .object({
    questionId: uuidSchema,
    questionVersionId: uuidSchema,
    questionType: questionTypeSchema,
    skill: questionSkillSchema,
    difficulty: difficultySchema,
    template: questionTemplateSchema,
    blocks: z.array(publicQuestionBlockSchema),
    options: z.array(questionOptionSchema),
    saved: z.boolean(),
  })
  .strict()
  .superRefine((detail, context) => {
    const inline = detail.template === 'INLINE_SPAN_CHOICE';
    detail.options.forEach((option, index) => {
      if (
        (inline && option.sentence !== null) ||
        (!inline && option.span !== null)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            '문제 template과 선택지 sentence·span 조합이 일치해야 합니다.',
          path: ['options', index],
        });
      }
    });
  });

/** 첫 답·재시도와 멱등 재전송에 사용하는 답안 요청 */
export const submitQuestionAttemptRequestSchema = z
  .object({
    questionVersionId: uuidSchema,
    selectedOptionId: uuidSchema,
    clientAttemptId: uuidSchema,
    durationMs: nonnegativeSafeIntegerSchema,
  })
  .strict();

/** 제출된 답과 제출 뒤에만 공개하는 정답·해설 응답 */
export const submitQuestionAttemptResponseSchema = z
  .object({
    attempt: z
      .object({
        id: uuidSchema,
        attemptNo: positiveSafeIntegerSchema,
        isFirst: z.boolean(),
        isCorrect: z.boolean(),
        selectedOptionId: uuidSchema,
        submittedAt: utcDateTimeSchema,
      })
      .strict(),
    feedback: z
      .object({
        correctOptionId: uuidSchema,
        explanationBlocks: z.array(explanationBlockSchema),
      })
      .strict(),
  })
  .strict();

/** 현재 콘텐츠 상태와 무관한 원시 풀이 기록 페이지 query */
export const questionAttemptListQuerySchema = z.object(pageQueryShape).strict();

/** 무효화된 버전의 과거 제출도 보존하는 원시 풀이 기록 페이지 */
export const questionAttemptListResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: uuidSchema,
          questionId: uuidSchema,
          questionVersionId: uuidSchema,
          attemptNo: positiveSafeIntegerSchema,
          selectedOptionId: uuidSchema,
          clientAttemptId: uuidSchema,
          durationMs: nonnegativeSafeIntegerSchema,
          isCorrect: z.boolean(),
          submittedAt: utcDateTimeSchema,
        })
        .strict(),
    ),
    page: pageMetadataSchema,
  })
  .strict();

/** 문제 단건·저장 경로의 UUID parameter */
export const questionIdPathSchema = z
  .object({ questionId: uuidSchema })
  .strict();

/** 검증된 문제 목록 query type */
export type QuestionListQuery = z.infer<typeof questionListQuerySchema>;

/** 직렬화 가능한 공통 페이지 metadata type */
export type PageMetadata = z.infer<typeof pageMetadataSchema>;

/** 직렬화 가능한 정답 없는 문제 요약 type */
export type QuestionListItem = z.infer<typeof questionListItemSchema>;

/** 직렬화 가능한 문제 목록 응답 type */
export type QuestionListResponse = z.infer<typeof questionListResponseSchema>;

/** 직렬화 가능한 문제 상세 응답 type */
export type QuestionDetailResponse = z.infer<
  typeof questionDetailResponseSchema
>;

/** 검증된 답안 제출 요청 type */
export type SubmitQuestionAttemptRequest = z.infer<
  typeof submitQuestionAttemptRequestSchema
>;

/** 직렬화 가능한 답안 제출 응답 type */
export type SubmitQuestionAttemptResponse = z.infer<
  typeof submitQuestionAttemptResponseSchema
>;

/** 검증된 원시 풀이 기록 query type */
export type QuestionAttemptListQuery = z.infer<
  typeof questionAttemptListQuerySchema
>;

/** 직렬화 가능한 원시 풀이 기록 응답 type */
export type QuestionAttemptListResponse = z.infer<
  typeof questionAttemptListResponseSchema
>;

/** 검증된 문제 UUID path type */
export type QuestionIdPath = z.infer<typeof questionIdPathSchema>;
