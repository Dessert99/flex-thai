/** 관리자 어휘의 모든 상태 조회와 참조 보존 전체 교체 계약을 정의한다 */
import { z } from 'zod';
import { pageMetadataSchema } from '../learning/questions.js';
import { adminVocabularyRelationSchema } from './vocabulary-relations.js';

const uuidSchema = z.uuid();
const utcDateTimeSchema = z.string().datetime();
const difficultySchema = z.number().int().safe().min(1).max(5);
const vocabularyKindSchema = z.enum(['WORD', 'EXPRESSION']);
const vocabularyStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'HIDDEN',
  'MERGED',
]);

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

const hasDuplicates = (values: readonly string[]): boolean =>
  new Set(values).size !== values.length;

/** 모든 어휘 상태와 표기를 검색하는 관리자 페이지 query */
export const adminVocabularyListQuerySchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    kind: vocabularyKindSchema.optional(),
    status: vocabularyStatusSchema.optional(),
    page: httpIntegerSchema(1, Number.MAX_SAFE_INTEGER).default(1),
    pageSize: httpIntegerSchema(1, 100).default(20),
  })
  .strict();

/** 어휘 상세·교체·게시·숨김·복구 경로의 UUID parameter */
export const adminVocabularyIdPathSchema = z
  .object({ vocabularyId: uuidSchema })
  .strict();

const adminVocabularyMeaningInputSchema = z
  .object({
    clientRef: z.string().min(1),
    meaningKo: z.string().min(1),
    partOfSpeech: z.string().min(1),
    difficulty: difficultySchema.nullable().optional(),
    contextNote: z.string().min(1).nullable().optional(),
  })
  .strict();

export const adminVocabularyReplaceRequestSchema = z
  .object({
    thai: z.string().min(1),
    kind: vocabularyKindSchema,
    meanings: z.array(adminVocabularyMeaningInputSchema).min(1),
  })
  .strict()
  .superRefine((vocabulary, context) => {
    const meaningRefs = vocabulary.meanings.map(({ clientRef }) => clientRef);
    if (hasDuplicates(meaningRefs)) {
      context.addIssue({
        code: 'custom',
        message: '어휘 하위 clientRef는 중복될 수 없습니다.',
        path: ['meanings'],
      });
    }
  });

const adminVocabularyListItemSchema = z
  .object({
    id: uuidSchema,
    thai: z.string().min(1),
    kind: vocabularyKindSchema,
    status: vocabularyStatusSchema,
    mergedIntoVocabularyId: uuidSchema.nullable(),
    meaningCount: z.number().int().safe().nonnegative(),
    updatedAt: utcDateTimeSchema,
  })
  .strict();

/** 모든 상태의 관리자 어휘 목록 페이지 응답 */
export const adminVocabularyListResponseSchema = z
  .object({
    items: z.array(adminVocabularyListItemSchema),
    page: pageMetadataSchema,
  })
  .strict();

const adminVocabularyMeaningSchema = z
  .object({
    id: uuidSchema,
    meaningKo: z.string().min(1),
    partOfSpeech: z.string().min(1),
    difficulty: difficultySchema.nullable(),
    contextNote: z.string().min(1).nullable(),
  })
  .strict();

export const adminVocabularyDetailResponseSchema = z
  .object({
    id: uuidSchema,
    thai: z.string().min(1),
    kind: vocabularyKindSchema,
    status: vocabularyStatusSchema,
    importanceWeight: z.number().int().min(1).max(10),
    mergedIntoVocabularyId: uuidSchema.nullable(),
    meanings: z.array(adminVocabularyMeaningSchema),
    relations: z.array(adminVocabularyRelationSchema),
    usage: z
      .object({
        sentenceVersionIds: z.array(uuidSchema),
        questionIds: z.array(uuidSchema),
        questionCount: z.number().int().nonnegative(),
        targetQuestionCount: z.number().int().nonnegative(),
        occurrenceCount: z.number().int().nonnegative(),
      })
      .strict(),
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  })
  .strict()
  .superRefine((vocabulary, context) => {
    const meaningIds = vocabulary.meanings.map(({ id }) => id);
    if (hasDuplicates(meaningIds)) {
      context.addIssue({
        code: 'custom',
        message: '뜻 ID는 중복될 수 없습니다.',
        path: ['meanings'],
      });
    }
    vocabulary.relations.forEach((relation, index) => {
      if (
        !meaningIds.includes(relation.sourceMeaningId) &&
        !meaningIds.includes(relation.targetMeaningId)
      ) {
        context.addIssue({
          code: 'custom',
          message: '관계는 상세 응답 안의 뜻 하나 이상과 연결되어야 합니다.',
          path: ['relations', index],
        });
      }
    });
  });

/** 검증된 관리자 어휘 목록 query type */
export type AdminVocabularyListQuery = z.infer<
  typeof adminVocabularyListQuerySchema
>;

/** 검증된 관리자 어휘 UUID path type */
export type AdminVocabularyIdPath = z.infer<typeof adminVocabularyIdPathSchema>;

/** 관리자 어휘 전체 교체 요청 type */
export type AdminVocabularyReplaceRequest = z.infer<
  typeof adminVocabularyReplaceRequestSchema
>;

/** 관리자 어휘 목록 응답 type */
export type AdminVocabularyListResponse = z.infer<
  typeof adminVocabularyListResponseSchema
>;

/** 관리자 어휘 상세 응답 type */
export type AdminVocabularyDetailResponse = z.infer<
  typeof adminVocabularyDetailResponseSchema
>;

/** 게시 여부와 무관하게 관리자가 출제 중요도를 조정한다. */
export const adminVocabularyImportanceRequestSchema = z
  .object({ importanceWeight: z.number().int().min(1).max(10) })
  .strict();
