/** 개념 학습의 학습자·관리자 공개 계약을 정의한다 */
import { z } from 'zod';
import { publicThaiSentenceSchema } from '../thai-content/sentences.js';

const uuidSchema = z.uuid();
const positionSchema = z.number().int().safe().nonnegative();
const utcDateTimeSchema = z.string().datetime();
const nullableDateTimeSchema = utcDateTimeSchema.nullable();

/** 개념 영역 */
export const conceptCategorySchema = z.enum([
  'THAI_SCRIPT_PRONUNCIATION',
  'GRAMMAR',
]);

/** 논리 개념 상태 */
export const conceptStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']);

/** 개념 버전 상태 */
export const conceptVersionStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'RETIRED',
]);

/** 개념 검증 상태 */
export const conceptValidationStatusSchema = z.enum([
  'PENDING',
  'PASSED',
  'FAILED',
]);

const explanationBlockInputSchema = z
  .object({
    kind: z.literal('EXPLANATION'),
    position: positionSchema,
    heading: z.string().trim().min(1),
    paragraphs: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const ruleTableBlockInputSchema = z
  .object({
    kind: z.literal('RULE_TABLE'),
    position: positionSchema,
    heading: z.string().trim().min(1),
    headers: z.array(z.string().trim().min(1)).min(1),
    rows: z.array(z.array(z.string().trim().min(1)).min(1)).min(1),
  })
  .strict()
  .superRefine((block, context) => {
    block.rows.forEach((row, index) => {
      if (row.length !== block.headers.length) {
        context.addIssue({
          code: 'custom',
          path: ['rows', index],
          message: '모든 행의 열 수는 헤더와 같아야 합니다.',
        });
      }
    });
  });

const conceptExampleInputSchema = z
  .object({
    position: positionSchema,
    sentenceVersionId: uuidSchema,
    noteKo: z.string().trim().min(1).nullable(),
  })
  .strict();

const thaiExamplesBlockInputSchema = z
  .object({
    kind: z.literal('THAI_EXAMPLES'),
    position: positionSchema,
    heading: z.string().trim().min(1),
    examples: z.array(conceptExampleInputSchema).min(1),
  })
  .strict();

/** 개념 초안의 블록 입력 */
export const conceptBlockInputSchema = z.discriminatedUnion('kind', [
  explanationBlockInputSchema,
  ruleTableBlockInputSchema,
  thaiExamplesBlockInputSchema,
]);

const conceptDraftShape = {
  category: conceptCategorySchema,
  position: positionSchema,
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  blocks: z.array(conceptBlockInputSchema).min(1),
};

/** 논리 개념과 첫 초안을 생성하는 요청 */
export const createConceptRequestSchema = z.object(conceptDraftShape).strict();

/** 기존 초안 전체를 교체하는 요청 */
export const replaceConceptVersionRequestSchema = z
  .object({ revision: positionSchema, ...conceptDraftShape })
  .strict();

/** 학습자 개념 목록 query */
export const conceptListQuerySchema = z
  .object({ category: conceptCategorySchema })
  .strict();

/** 관리자 개념 목록 query */
export const adminConceptListQuerySchema = z
  .object({
    category: conceptCategorySchema.optional(),
    status: conceptStatusSchema.optional(),
    page: z.coerce.number().int().safe().positive().default(1),
    pageSize: z.coerce.number().int().safe().min(1).max(100).default(20),
  })
  .strict();

/** 개념 또는 개념 버전 UUID path */
export const conceptIdPathSchema = z.object({ conceptId: uuidSchema }).strict();
export const conceptVersionIdPathSchema = z
  .object({ versionId: uuidSchema })
  .strict();

/** 개념 검증 문제 */
export const conceptValidationIssueSchema = z
  .object({
    source: z.enum(['STRUCTURE', 'REFERENCE', 'EXTERNAL']),
    path: z.string().min(1),
    code: z.string().min(1),
    evidenceKo: z.string().min(1),
  })
  .strict();

const conceptListItemSchema = z
  .object({
    id: uuidSchema,
    category: conceptCategorySchema,
    position: positionSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

/** 학습자 개념 목록 응답 */
export const conceptListResponseSchema = z
  .object({ items: z.array(conceptListItemSchema) })
  .strict();

const publicBlockBase = {
  id: uuidSchema,
  position: positionSchema,
  heading: z.string().min(1),
};
const publicConceptBlockSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...publicBlockBase,
      kind: z.literal('EXPLANATION'),
      paragraphs: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      ...publicBlockBase,
      kind: z.literal('RULE_TABLE'),
      headers: z.array(z.string().min(1)).min(1),
      rows: z.array(z.array(z.string().min(1)).min(1)).min(1),
    })
    .strict(),
  z
    .object({
      ...publicBlockBase,
      kind: z.literal('THAI_EXAMPLES'),
      examples: z
        .array(
          z
            .object({
              position: positionSchema,
              noteKo: z.string().min(1).nullable(),
              sentence: publicThaiSentenceSchema,
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
]);

/** 학습자 개념 상세 응답 */
export const conceptDetailResponseSchema = z
  .object({
    id: uuidSchema,
    versionId: uuidSchema,
    category: conceptCategorySchema,
    position: positionSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    tableOfContents: z.array(
      z
        .object({
          blockId: uuidSchema,
          heading: z.string().min(1),
          position: positionSchema,
        })
        .strict(),
    ),
    blocks: z.array(publicConceptBlockSchema),
  })
  .strict();

const adminRuleTableBlockSchema = z
  .object({
    id: uuidSchema,
    kind: z.literal('RULE_TABLE'),
    position: positionSchema,
    heading: z.string().trim().min(1),
    headers: z.array(z.string().trim().min(1)).min(1),
    rows: z.array(z.array(z.string().trim().min(1)).min(1)).min(1),
  })
  .strict()
  .superRefine((block, context) => {
    block.rows.forEach((row, index) => {
      if (row.length !== block.headers.length) {
        context.addIssue({
          code: 'custom',
          path: ['rows', index],
          message: '모든 행의 열 수는 헤더와 같아야 합니다.',
        });
      }
    });
  });

const adminConceptBlockSchema = z.union([
  z
    .object({
      id: uuidSchema,
      kind: z.literal('EXPLANATION'),
      position: positionSchema,
      heading: z.string().trim().min(1),
      paragraphs: z.array(z.string().trim().min(1)).min(1),
    })
    .strict(),
  adminRuleTableBlockSchema,
  z
    .object({
      id: uuidSchema,
      kind: z.literal('THAI_EXAMPLES'),
      position: positionSchema,
      heading: z.string().trim().min(1),
      examples: z.array(conceptExampleInputSchema).min(1),
    })
    .strict(),
]);

/** 관리자 개념 버전 응답 */
export const adminConceptVersionSchema = z
  .object({
    id: uuidSchema,
    conceptId: uuidSchema,
    version: z.number().int().safe().positive(),
    revision: positionSchema,
    category: conceptCategorySchema,
    position: positionSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    status: conceptVersionStatusSchema,
    validationStatus: conceptValidationStatusSchema,
    validationIssues: z.array(conceptValidationIssueSchema),
    validatedAt: nullableDateTimeSchema,
    publishedAt: nullableDateTimeSchema,
    blocks: z.array(adminConceptBlockSchema),
  })
  .strict();

/** 관리자 개념 목록 응답 */
export const adminConceptListResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: uuidSchema,
          status: conceptStatusSchema,
          category: conceptCategorySchema,
          position: positionSchema,
          title: z.string().min(1),
          latestVersion: z.number().int().safe().positive(),
          validationStatus: conceptValidationStatusSchema,
        })
        .strict(),
    ),
    page: z.number().int().safe().positive(),
    pageSize: z.number().int().safe().positive(),
    total: positionSchema,
  })
  .strict();

/** 관리자 개념 상세 응답 */
export const adminConceptDetailResponseSchema = z
  .object({
    id: uuidSchema,
    status: conceptStatusSchema,
    currentPublishedVersionId: uuidSchema.nullable(),
    versions: z.array(adminConceptVersionSchema),
  })
  .strict();

/** 개념 검증 응답 */
export const conceptValidationReportSchema = z
  .object({
    versionId: uuidSchema,
    revision: positionSchema,
    status: conceptValidationStatusSchema,
    issues: z.array(conceptValidationIssueSchema),
    validatedAt: utcDateTimeSchema,
  })
  .strict();

/** 개념 생성·복제·교체 응답 */
export const conceptVersionResponseSchema = adminConceptVersionSchema;

/** 직렬화 가능한 개념 영역 */
export type ConceptCategory = z.infer<typeof conceptCategorySchema>;
/** 직렬화 가능한 논리 개념 상태 */
export type ConceptStatus = z.infer<typeof conceptStatusSchema>;
/** 직렬화 가능한 개념 버전 상태 */
export type ConceptVersionStatus = z.infer<typeof conceptVersionStatusSchema>;
/** 직렬화 가능한 개념 검증 상태 */
export type ConceptValidationStatus = z.infer<
  typeof conceptValidationStatusSchema
>;
/** 직렬화 가능한 개념 블록 입력 */
export type ConceptBlockInput = z.infer<typeof conceptBlockInputSchema>;
/** 직렬화 가능한 개념 생성 요청 */
export type CreateConceptRequest = z.infer<typeof createConceptRequestSchema>;
/** 직렬화 가능한 개념 버전 교체 요청 */
export type ReplaceConceptVersionRequest = z.infer<
  typeof replaceConceptVersionRequestSchema
>;
/** 직렬화 가능한 학습자 개념 목록 */
export type ConceptListResponse = z.infer<typeof conceptListResponseSchema>;
/** 직렬화 가능한 학습자 개념 상세 */
export type ConceptDetailResponse = z.infer<typeof conceptDetailResponseSchema>;
/** 직렬화 가능한 관리자 개념 목록 query */
export type AdminConceptListQuery = z.infer<typeof adminConceptListQuerySchema>;
/** 직렬화 가능한 관리자 개념 목록 */
export type AdminConceptListResponse = z.infer<
  typeof adminConceptListResponseSchema
>;
/** 직렬화 가능한 관리자 개념 상세 */
export type AdminConceptDetailResponse = z.infer<
  typeof adminConceptDetailResponseSchema
>;
/** 직렬화 가능한 관리자 개념 버전 */
export type AdminConceptVersion = z.infer<typeof adminConceptVersionSchema>;
/** 직렬화 가능한 개념 검증 보고서 */
export type ConceptValidationReport = z.infer<
  typeof conceptValidationReportSchema
>;
