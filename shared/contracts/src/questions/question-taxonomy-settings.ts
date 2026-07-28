/** FLEX 문제 분류·유형 버전·주제·태그 관리자 계약을 정의한다 */
import { z } from 'zod';
import { adminQuestionVersionPayloadSchema } from '../admin/questions.js';
import {
  questionMajorCategorySchema,
  type QuestionMajorCategory,
} from './question-major-category.js';

/** 대분류 leaf 계약을 기존 문제 분류 설정 공개 경계로 전달한다 */
export { questionMajorCategorySchema, type QuestionMajorCategory };

const uuidSchema = z.uuid();
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const displayNameSchema = z.string().trim().min(1).max(100);

/** 대분류에서 파생되는 영역과 기본 출제 형식 */
export const questionMajorCategoryMetadata = {
  LISTENING_RESPONSE: {
    label: '반응 테스트',
    skill: 'LISTENING',
    template: 'STANDARD_CHOICE',
    optionCount: 3,
  },
  LISTENING_DIALOGUE: {
    label: '대화문',
    skill: 'LISTENING',
    template: 'DIALOGUE_CHOICE',
    optionCount: 4,
  },
  LISTENING_PASSAGE: {
    label: '설명문',
    skill: 'LISTENING',
    template: 'PASSAGE_CHOICE',
    optionCount: 4,
  },
  READING_VOCABULARY_GRAMMAR: {
    label: '어휘·문법',
    skill: 'READING',
    template: 'STANDARD_CHOICE',
    optionCount: 4,
  },
  READING_SYNONYM_RELATION: {
    label: '동의·유의 관계',
    skill: 'READING',
    template: 'STANDARD_CHOICE',
    optionCount: 4,
  },
  READING_ERROR_IDENTIFICATION: {
    label: '비문 찾기',
    skill: 'READING',
    template: 'INLINE_SPAN_CHOICE',
    optionCount: 4,
  },
  READING_PASSAGE: {
    label: '지문 독해',
    skill: 'READING',
    template: 'PASSAGE_CHOICE',
    optionCount: 4,
  },
} as const satisfies Record<
  QuestionMajorCategory,
  {
    label: string;
    skill: 'READING' | 'LISTENING';
    template:
      | 'STANDARD_CHOICE'
      | 'PASSAGE_CHOICE'
      | 'DIALOGUE_CHOICE'
      | 'INLINE_SPAN_CHOICE';
    optionCount: 3 | 4;
  }
>;

/** 불변 문제 유형 버전의 수명 상태 */
export const questionTypeVersionStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'RETIRED',
]);

/** 주제와 태그의 선택 가능 상태 */
export const questionTaxonomyStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

/** 세부 문제 유형과 최초 DRAFT 버전을 만드는 요청 */
export const createQuestionTypeRequestSchema = z
  .object({
    slug: slugSchema,
    displayName: displayNameSchema,
    majorCategory: questionMajorCategorySchema,
  })
  .strict();

/** 기존 세부 유형에 불변 DRAFT 버전을 추가하는 요청 */
export const createQuestionTypeVersionRequestSchema = z
  .object({
    template: z.enum([
      'STANDARD_CHOICE',
      'PASSAGE_CHOICE',
      'DIALOGUE_CHOICE',
      'INLINE_SPAN_CHOICE',
    ]),
    optionCount: z.union([z.literal(3), z.literal(4)]),
    decisionRules: z.record(z.string(), z.unknown()),
  })
  .strict();

const difficultyCriterionSchema = z
  .object({
    difficulty: z.number().int().min(1).max(5),
    criteria: z.string().trim().min(1).max(1_000),
  })
  .strict();

/** 유형 버전의 1~5 난이도 기준 전체를 교체하는 요청 */
export const replaceDifficultyCriteriaRequestSchema = z
  .object({
    criteria: z.array(difficultyCriterionSchema).length(5),
  })
  .strict()
  .superRefine(({ criteria }, context) => {
    if (criteria.some(({ difficulty }, index) => difficulty !== index + 1)) {
      context.addIssue({
        code: 'custom',
        path: ['criteria'],
        message: '난이도 기준은 1부터 5까지 순서대로 하나씩 필요합니다.',
      });
    }
  });

/** 유형 버전 활성화 전 검증할 canonical 승인 예시 요청 */
export const questionTypeApprovedExampleRequestSchema = z
  .object({
    title: displayNameSchema,
    payload: adminQuestionVersionPayloadSchema,
  })
  .strict();

/** 주제 또는 태그를 만드는 요청 */
export const createQuestionTaxonomyTermRequestSchema = z
  .object({
    slug: slugSchema,
    displayName: displayNameSchema,
  })
  .strict();

/** 관리자 taxonomy 상세 조회 응답 */
export const questionTaxonomySettingsResponseSchema = z
  .object({
    questionTypes: z.array(
      z
        .object({
          id: uuidSchema,
          slug: slugSchema,
          displayName: displayNameSchema,
          majorCategory: questionMajorCategorySchema,
          versions: z.array(
            z
              .object({
                id: uuidSchema,
                version: z.number().int().positive(),
                status: questionTypeVersionStatusSchema,
                template: createQuestionTypeVersionRequestSchema.shape.template,
                optionCount:
                  createQuestionTypeVersionRequestSchema.shape.optionCount,
                decisionRules: z.record(z.string(), z.unknown()),
                difficultyCriteria: z.array(difficultyCriterionSchema),
                approvedExamples: z.array(
                  z
                    .object({
                      id: uuidSchema,
                      title: displayNameSchema,
                      payload: adminQuestionVersionPayloadSchema,
                    })
                    .strict(),
                ),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    topics: z.array(
      z
        .object({
          id: uuidSchema,
          slug: slugSchema,
          displayName: displayNameSchema,
          status: questionTaxonomyStatusSchema,
        })
        .strict(),
    ),
    tags: z.array(
      z
        .object({
          id: uuidSchema,
          slug: slugSchema,
          displayName: displayNameSchema,
          status: questionTaxonomyStatusSchema,
        })
        .strict(),
    ),
  })
  .strict();

export type QuestionTypeVersionStatus = z.infer<
  typeof questionTypeVersionStatusSchema
>;
export type CreateQuestionTypeRequest = z.infer<
  typeof createQuestionTypeRequestSchema
>;
export type CreateQuestionTypeVersionRequest = z.infer<
  typeof createQuestionTypeVersionRequestSchema
>;
export type ReplaceDifficultyCriteriaRequest = z.infer<
  typeof replaceDifficultyCriteriaRequestSchema
>;
export type QuestionTypeApprovedExampleRequest = z.infer<
  typeof questionTypeApprovedExampleRequestSchema
>;
export type CreateQuestionTaxonomyTermRequest = z.infer<
  typeof createQuestionTaxonomyTermRequestSchema
>;
export type QuestionTaxonomySettingsResponse = z.infer<
  typeof questionTaxonomySettingsResponseSchema
>;
