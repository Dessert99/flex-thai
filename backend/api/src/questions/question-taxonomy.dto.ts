/** 문제 분류 설정 Zod 계약을 module-local Swagger DTO로 연결한다 */
import {
  createQuestionTaxonomyTermRequestSchema,
  createQuestionTypeRequestSchema,
  createQuestionTypeVersionRequestSchema,
  questionTaxonomySettingsResponseSchema,
  questionTypeApprovedExampleRequestSchema,
  replaceDifficultyCriteriaRequestSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 세부 문제 유형 생성 DTO */
export class CreateQuestionTypeRequestDto extends createZodDto(
  createQuestionTypeRequestSchema,
) {}
/** 불변 문제 유형 버전 생성 DTO */
export class CreateQuestionTypeVersionRequestDto extends createZodDto(
  createQuestionTypeVersionRequestSchema,
) {}
/** 1~5 난이도 기준 교체 DTO */
export class ReplaceDifficultyCriteriaRequestDto extends createZodDto(
  replaceDifficultyCriteriaRequestSchema,
) {}
/** canonical 승인 예시 snapshot DTO */
export class QuestionTypeApprovedExampleRequestDto extends createZodDto(
  questionTypeApprovedExampleRequestSchema,
) {}
/** 주제·태그 생성 DTO */
export class CreateQuestionTaxonomyTermRequestDto extends createZodDto(
  createQuestionTaxonomyTermRequestSchema,
) {}
/** 문제 분류 설정 전체 응답 DTO */
export class QuestionTaxonomySettingsResponseDto extends createZodDto(
  questionTaxonomySettingsResponseSchema,
) {}
