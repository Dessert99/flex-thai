/** 문제 분류 설정 form의 공개 계약 입력을 재사용한다 */
import {
  createQuestionTaxonomyTermRequestSchema,
  createQuestionTypeRequestSchema,
  questionTypeApprovedExampleRequestSchema,
  replaceDifficultyCriteriaRequestSchema,
} from '@flex-thia/contracts';

/** 세부 유형 생성 form schema */
export const questionTypeFormSchema = createQuestionTypeRequestSchema;
/** 주제·태그 생성 form schema */
export const taxonomyTermFormSchema = createQuestionTaxonomyTermRequestSchema;
/** 난이도 1~5 기준 form schema */
export const difficultyCriteriaFormSchema =
  replaceDifficultyCriteriaRequestSchema;
/** canonical 승인 예시 form schema */
export const approvedExampleFormSchema =
  questionTypeApprovedExampleRequestSchema;
