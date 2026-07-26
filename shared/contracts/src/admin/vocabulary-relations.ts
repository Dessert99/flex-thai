/** 관리자 뜻 관계 CRUD와 stale-safe 어휘 병합 공개 계약을 정의한다 */
import { z } from 'zod';

const uuidSchema = z.uuid();
const relationTypeSchema = z.enum(['SYNONYM', 'ANTONYM', 'RELATED']);
const relationDirectionSchema = z.enum(['DIRECTED', 'BIDIRECTIONAL']);
const relationStatusSchema = z.enum(['PENDING', 'PASSED', 'FAILED']);
const vocabularyKindSchema = z.enum(['WORD', 'EXPRESSION']);
const sourceVocabularyStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']);
const mergeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

/** 관계가 속한 어휘와 relation 경로 parameter */
export const adminVocabularyRelationPathSchema = z
  .object({
    vocabularyId: uuidSchema,
    relationId: uuidSchema,
  })
  .strict();

/** 새 뜻 관계를 PENDING으로 생성하는 요청 */
export const adminVocabularyRelationCreateRequestSchema = z
  .object({
    sourceMeaningId: uuidSchema,
    targetMeaningId: uuidSchema,
    type: relationTypeSchema,
    direction: relationDirectionSchema,
  })
  .strict();

/** 관계 메타데이터 또는 검토 상태를 바꾸는 요청 */
export const adminVocabularyRelationUpdateRequestSchema = z
  .object({
    type: relationTypeSchema.optional(),
    direction: relationDirectionSchema.optional(),
    status: relationStatusSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: '하나 이상의 관계 변경 필드가 필요합니다.',
  });

/** 관리자 상세과 관계 mutation이 공유하는 관계 projection */
export const adminVocabularyRelationSchema = z
  .object({
    id: uuidSchema,
    sourceMeaningId: uuidSchema,
    targetMeaningId: uuidSchema,
    type: relationTypeSchema,
    direction: relationDirectionSchema,
    status: relationStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

/** 병합 preview가 비교할 대표 어휘 요청 */
export const adminVocabularyMergePreviewRequestSchema = z
  .object({ representativeVocabularyId: uuidSchema })
  .strict();

const mergeUsageSchema = z
  .object({
    tokenOccurrences: z.number().int().safe().nonnegative(),
    expressionOccurrences: z.number().int().safe().nonnegative(),
    savedMemberships: z.number().int().safe().nonnegative(),
    wordbookMemberships: z.number().int().safe().nonnegative(),
    practiceQuestions: z.number().int().safe().nonnegative(),
  })
  .strict();

const mergeVocabularySchema = z
  .object({
    id: uuidSchema,
    thai: z.string().min(1),
    normalizedThai: z.string().min(1),
    kind: vocabularyKindSchema,
    status: sourceVocabularyStatusSchema,
    meaningCount: z.number().int().safe().nonnegative(),
    pronunciationCount: z.number().int().safe().nonnegative(),
    usage: mergeUsageSchema,
  })
  .strict();

/** 두 graph와 사용처·정규화 비교·opaque token을 반환하는 preview */
export const adminVocabularyMergePreviewResponseSchema = z
  .object({
    source: mergeVocabularySchema,
    representative: mergeVocabularySchema.extend({
      status: z.literal('PUBLISHED'),
    }),
    comparison: z
      .object({
        normalizedEqual: z.boolean(),
        codePointDistance: z.number().int().safe().nonnegative(),
      })
      .strict(),
    mergeToken: mergeTokenSchema,
  })
  .strict();

/** stale preview를 재검증하며 병합하는 실행 요청 */
export const adminVocabularyMergeExecuteRequestSchema = z
  .object({
    representativeVocabularyId: uuidSchema,
    mergeToken: mergeTokenSchema,
  })
  .strict();

/** 병합 이동 수와 대표 ID를 반환하는 실행 결과 */
export const adminVocabularyMergeResponseSchema = z
  .object({
    sourceVocabularyId: uuidSchema,
    representativeVocabularyId: uuidSchema,
    movedCounts: mergeUsageSchema.extend({
      meanings: z.number().int().safe().nonnegative(),
      pronunciations: z.number().int().safe().nonnegative(),
      meaningPronunciations: z.number().int().safe().nonnegative(),
    }),
  })
  .strict();

/** 검증된 관계 생성 요청 type */
export type AdminVocabularyRelationCreateRequest = z.infer<
  typeof adminVocabularyRelationCreateRequestSchema
>;

/** 검증된 관계 수정 요청 type */
export type AdminVocabularyRelationUpdateRequest = z.infer<
  typeof adminVocabularyRelationUpdateRequestSchema
>;

/** 직렬화 가능한 관리자 관계 projection type */
export type AdminVocabularyRelation = z.infer<
  typeof adminVocabularyRelationSchema
>;

/** 검증된 병합 preview 요청 type */
export type AdminVocabularyMergePreviewRequest = z.infer<
  typeof adminVocabularyMergePreviewRequestSchema
>;

/** 직렬화 가능한 병합 preview type */
export type AdminVocabularyMergePreviewResponse = z.infer<
  typeof adminVocabularyMergePreviewResponseSchema
>;

/** 검증된 병합 실행 요청 type */
export type AdminVocabularyMergeExecuteRequest = z.infer<
  typeof adminVocabularyMergeExecuteRequestSchema
>;

/** 직렬화 가능한 병합 결과 type */
export type AdminVocabularyMergeResponse = z.infer<
  typeof adminVocabularyMergeResponseSchema
>;
