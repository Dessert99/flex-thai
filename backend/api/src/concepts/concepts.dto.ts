/** 개념 Zod 계약을 module-local Swagger DTO로 연결한다 */
import {
  adminConceptDetailResponseSchema,
  adminConceptListQuerySchema,
  adminConceptListResponseSchema,
  conceptDetailResponseSchema,
  conceptIdPathSchema,
  conceptListQuerySchema,
  conceptListResponseSchema,
  conceptValidationReportSchema,
  conceptVersionIdPathSchema,
  conceptVersionResponseSchema,
  createConceptRequestSchema,
  replaceConceptVersionRequestSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 학습자 개념 목록 query DTO */
export class ConceptListQueryDto extends createZodDto(conceptListQuerySchema) {}
/** 학습자 개념 목록 응답 DTO */
export class ConceptListResponseDto extends createZodDto(
  conceptListResponseSchema,
) {}
/** 학습자 개념 상세 응답 DTO */
export class ConceptDetailResponseDto extends createZodDto(
  conceptDetailResponseSchema,
) {}
/** 개념 UUID path DTO */
export class ConceptIdPathDto extends createZodDto(conceptIdPathSchema) {}
/** 개념 버전 UUID path DTO */
export class ConceptVersionIdPathDto extends createZodDto(
  conceptVersionIdPathSchema,
) {}
/** 관리자 개념 목록 query DTO */
export class AdminConceptListQueryDto extends createZodDto(
  adminConceptListQuerySchema,
) {}
/** 관리자 개념 목록 응답 DTO */
export class AdminConceptListResponseDto extends createZodDto(
  adminConceptListResponseSchema,
) {}
/** 관리자 개념 상세 응답 DTO */
export class AdminConceptDetailResponseDto extends createZodDto(
  adminConceptDetailResponseSchema,
) {}
/** 개념과 첫 초안 생성 요청 DTO */
export class CreateConceptRequestDto extends createZodDto(
  createConceptRequestSchema,
) {}
/** 개념 버전 전체 교체 요청 DTO */
export class ReplaceConceptVersionRequestDto extends createZodDto(
  replaceConceptVersionRequestSchema,
) {}
/** 개념 버전 응답 DTO */
export class ConceptVersionResponseDto extends createZodDto(
  conceptVersionResponseSchema,
) {}
/** 개념 검증 보고서 DTO */
export class ConceptValidationReportDto extends createZodDto(
  conceptValidationReportSchema,
) {}
