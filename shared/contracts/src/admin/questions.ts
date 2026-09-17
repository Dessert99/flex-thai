/** 관리자 문제 본문·보기·사용 어휘와 수정 충돌 방지 계약. */
import { z } from 'zod';
import { pageMetadataSchema } from '../learning/questions.js';
const status = z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']);
const positiveInteger = z.number().int().safe().positive();
const httpInteger = (max: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^[1-9]\d*$/u)
        .transform(Number),
    ])
    .pipe(positiveInteger.max(max));
export const adminQuestionListQuerySchema = z
  .object({
    status: status.optional(),
    questionTypeSlug: z.string().trim().min(1).optional(),
    skill: z.literal('READING').optional(),
    difficulty: httpInteger(5).optional(),
    page: httpInteger(Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpInteger(100).default(20),
  })
  .strict();
export const adminQuestionIdPathSchema = z
  .object({ questionId: z.uuid() })
  .strict();
export const questionVocabularySchema = z
  .object({
    vocabularyId: z.uuid(),
    meaningId: z.uuid().nullable(),
    role: z.enum(['TARGET', 'CONTEXT']),
    occurrenceCount: positiveInteger,
  })
  .strict();
export const adminQuestionPayloadSchema = z
  .object({
    typeVersionId: z.uuid(),
    topicId: z.uuid(),
    tagIds: z.array(z.uuid()),
    difficulty: positiveInteger.max(5),
    passage: z.string().nullable(),
    prompt: z.string().trim().min(1),
    options: z
      .array(
        z.object({ id: z.uuid(), text: z.string().trim().min(1) }).strict(),
      )
      .min(2)
      .max(10),
    correctOptionId: z.uuid(),
    explanation: z.string().trim().min(1),
    vocabularies: z.array(questionVocabularySchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.options.map((item) => item.id)).size !==
        value.options.length ||
      !value.options.some((item) => item.id === value.correctOptionId)
    )
      context.addIssue({
        code: 'custom',
        message: '선택지 ID는 중복 없이 정답을 포함해야 합니다.',
        path: ['options'],
      });
    if (new Set(value.tagIds).size !== value.tagIds.length)
      context.addIssue({
        code: 'custom',
        message: '태그는 중복할 수 없습니다.',
        path: ['tagIds'],
      });
    if (
      new Set(value.vocabularies.map((item) => item.vocabularyId)).size !==
      value.vocabularies.length
    )
      context.addIssue({
        code: 'custom',
        message: '단어별 사용 정보를 하나로 합쳐주세요.',
        path: ['vocabularies'],
      });
  });
export const adminQuestionUpdateRequestSchema = z
  .object({
    input: adminQuestionPayloadSchema,
    expectedVersion: positiveInteger,
    expectedUpdatedAt: z.string().datetime(),
    requiresRetry: z.boolean(),
  })
  .strict();
export const adminQuestionStatusRequestSchema = z
  .object({ status, expectedUpdatedAt: z.string().datetime() })
  .strict();
export const adminQuestionDetailResponseSchema =
  adminQuestionPayloadSchema.safeExtend({
    questionId: z.uuid(),
    version: positiveInteger,
    status,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    publishedAt: z.string().datetime().nullable(),
  });
export const adminQuestionListResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          questionId: z.uuid(),
          version: positiveInteger,
          status,
          prompt: z.string(),
          questionTypeSlug: z.string(),
          difficulty: positiveInteger.max(5),
          updatedAt: z.string().datetime(),
        })
        .strict(),
    ),
    page: pageMetadataSchema,
  })
  .strict();
export type AdminQuestionListQuery = z.infer<
  typeof adminQuestionListQuerySchema
>;
export type AdminQuestionIdPath = z.infer<typeof adminQuestionIdPathSchema>;
export type AdminQuestionPayload = z.infer<typeof adminQuestionPayloadSchema>;
export type AdminQuestionUpdateRequest = z.infer<
  typeof adminQuestionUpdateRequestSchema
>;
export type AdminQuestionStatusRequest = z.infer<
  typeof adminQuestionStatusRequestSchema
>;
export type AdminQuestionDetailResponse = z.infer<
  typeof adminQuestionDetailResponseSchema
>;
export type AdminQuestionListResponse = z.infer<
  typeof adminQuestionListResponseSchema
>;
