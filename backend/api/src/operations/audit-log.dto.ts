/** 감사 기록 endpoint의 module-local Swagger DTO를 정의한다 */
import {
  auditLogDetailResponseSchema,
  auditLogIdPathSchema,
  auditLogListQuerySchema,
  auditLogListResponseSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 감사 기록 목록 query DTO */
export class AuditLogListQueryDto extends createZodDto(
  auditLogListQuerySchema,
) {}

/** 감사 기록 UUID path DTO */
export class AuditLogIdPathDto extends createZodDto(auditLogIdPathSchema) {}

/** 감사 기록 목록 응답 DTO */
export class AuditLogListResponseDto extends createZodDto(
  auditLogListResponseSchema,
) {}

/** 감사 기록 상세 응답 DTO */
export class AuditLogDetailResponseDto extends createZodDto(
  auditLogDetailResponseSchema,
) {}
