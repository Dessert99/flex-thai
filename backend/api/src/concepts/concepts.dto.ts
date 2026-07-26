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

export class ConceptListQueryDto extends createZodDto(conceptListQuerySchema) {}
export class ConceptListResponseDto extends createZodDto(
  conceptListResponseSchema,
) {}
export class ConceptDetailResponseDto extends createZodDto(
  conceptDetailResponseSchema,
) {}
export class ConceptIdPathDto extends createZodDto(conceptIdPathSchema) {}
export class ConceptVersionIdPathDto extends createZodDto(
  conceptVersionIdPathSchema,
) {}
export class AdminConceptListQueryDto extends createZodDto(
  adminConceptListQuerySchema,
) {}
export class AdminConceptListResponseDto extends createZodDto(
  adminConceptListResponseSchema,
) {}
export class AdminConceptDetailResponseDto extends createZodDto(
  adminConceptDetailResponseSchema,
) {}
export class CreateConceptRequestDto extends createZodDto(
  createConceptRequestSchema,
) {}
export class ReplaceConceptVersionRequestDto extends createZodDto(
  replaceConceptVersionRequestSchema,
) {}
export class ConceptVersionResponseDto extends createZodDto(
  conceptVersionResponseSchema,
) {}
export class ConceptValidationReportDto extends createZodDto(
  conceptValidationReportSchema,
) {}
