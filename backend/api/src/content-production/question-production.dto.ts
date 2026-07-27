/** AI 문제 후보 관리자 검수 Zod 계약을 Swagger reflection DTO로 연결한다 */
import {
  approveQuestionCandidateRequestSchema,
  approveQuestionCandidateResponseSchema,
  discardQuestionCandidateRequestSchema,
  questionCandidateDetailResponseSchema,
  questionCandidateListQuerySchema,
  questionCandidateListResponseSchema,
  questionCandidatePathSchema,
  regenerateQuestionCandidateRequestSchema,
  regenerateQuestionCandidateResponseSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 후보 목록 query Swagger DTO */
export class QuestionCandidateListQueryDto extends createZodDto(
  questionCandidateListQuerySchema,
) {}

/** 후보 목록 응답 Swagger DTO */
export class QuestionCandidateListResponseDto extends createZodDto(
  questionCandidateListResponseSchema,
) {}

/** 후보 경로 Swagger DTO */
export class QuestionCandidatePathDto extends createZodDto(
  questionCandidatePathSchema,
) {}

/** 후보 상세 응답 Swagger DTO */
export class QuestionCandidateDetailResponseDto extends createZodDto(
  questionCandidateDetailResponseSchema,
) {}

/** 후보 승인 요청 Swagger DTO */
export class ApproveQuestionCandidateRequestDto extends createZodDto(
  approveQuestionCandidateRequestSchema,
) {}

/** 후보 승인 응답 Swagger DTO */
export class ApproveQuestionCandidateResponseDto extends createZodDto(
  approveQuestionCandidateResponseSchema,
) {}

/** 후보 폐기 요청 Swagger DTO */
export class DiscardQuestionCandidateRequestDto extends createZodDto(
  discardQuestionCandidateRequestSchema,
) {}

/** 후보 재생성 요청 Swagger DTO */
export class RegenerateQuestionCandidateRequestDto extends createZodDto(
  regenerateQuestionCandidateRequestSchema,
) {}

/** 후보 재생성 접수 응답 Swagger DTO */
export class RegenerateQuestionCandidateResponseDto extends createZodDto(
  regenerateQuestionCandidateResponseSchema,
) {}
