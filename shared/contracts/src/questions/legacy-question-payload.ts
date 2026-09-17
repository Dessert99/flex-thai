/** 기존 AI 예시·가져오기 파일의 문장 입력 호환 계약. 저장 시 문제 본문으로 변환한다. */
import { z } from 'zod';
import { canonicalQuestionVersionInputSchema } from '../admin/content-imports.js';
const uuidSchema = z.uuid();
const positiveIntegerSchema = z.number().int().safe().positive();
const difficultySchema = positiveIntegerSchema.max(5);
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
    role: z.enum(['TARGET', 'REQUIRED', 'SUPPORTING', 'INSTRUCTION']),
  })
  .strict();

const adminQuestionExpressionInputSchema = z
  .object({
    startTokenIndex: z.number().int().safe().nonnegative(),
    endTokenIndex: positiveIntegerSchema,
    vocabulary: adminContentReferenceSchema,
    meaning: adminContentReferenceSchema,
    pronunciation: adminContentReferenceSchema,
    contextMeaningKo: z.string().min(1),
    representative: z.boolean().optional(),
  })
  .strict();

const adminQuestionSentenceInputSchema = z
  .object({
    originalText: z.string().min(1),
    translationKo: z.string().min(1),
    pronunciationKo: z.string().min(1),
    toneMarks: z.string(),
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

const adminQuestionOptionBaseShape = {
  clientRef: z.string().min(1),
  position: z.number().int().safe().nonnegative(),
};
const adminQuestionOptionSpanInputSchema = z
  .object({
    blockPosition: z.number().int().safe().nonnegative(),
    sentencePosition: z.number().int().safe().nonnegative(),
    startTokenIndex: z.number().int().safe().nonnegative(),
    endTokenIndex: positiveIntegerSchema,
  })
  .strict();
const adminQuestionOptionInputSchema = z.union([
  z
    .object({
      ...adminQuestionOptionBaseShape,
      sentence: adminQuestionSentenceInputSchema,
      span: z.null().default(null),
    })
    .strict(),
  z
    .object({
      ...adminQuestionOptionBaseShape,
      sentence: z.null(),
      span: adminQuestionOptionSpanInputSchema,
    })
    .strict(),
]);

/** 초안 문제 버전을 기존 콘텐츠 UUID 전용 canonical 구조로 전체 교체하는 요청 */
export const adminQuestionVersionPayloadSchema = z
  .object({
    questionTypeSlug: z.string().min(1),
    questionTypeVersion: positiveIntegerSchema,
    difficulty: difficultySchema,
    topicSlug: z.string().trim().min(1).default('general'),
    tagSlugs: z.array(z.string().trim().min(1)).default([]),
    blocks: z.array(adminQuestionBlockInputSchema).min(1),
    options: z.array(adminQuestionOptionInputSchema).min(1),
    correctOptionRef: z.string().min(1),
  })
  .strict()
  .superRefine((payload, context) => {
    // import와 공유하는 offset·option 관계 규칙은 한 원본에서 검증한다.
    const result = canonicalQuestionVersionInputSchema.safeParse({
      ...payload,
      blocks: payload.blocks.map((block) => ({
        ...block,
        sentences: block.sentences.map((entry) => ({
          ...entry,
          sentence: entry.sentence,
        })),
      })),
      options: payload.options.map((option) =>
        option.sentence === null
          ? option
          : {
              ...option,
              sentence: option.sentence,
            },
      ),
    });
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

export type AdminQuestionVersionPayload = z.infer<
  typeof adminQuestionVersionPayloadSchema
>;
