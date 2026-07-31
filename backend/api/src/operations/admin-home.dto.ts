/** 관리자 홈 Zod 응답을 Swagger reflection DTO로 연결한다 */
import { adminHomeOperationsResponseSchema } from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 관리자 홈 운영 집계 response DTO */
export class AdminHomeOperationsResponseDto extends createZodDto(
  adminHomeOperationsResponseSchema,
) {}
