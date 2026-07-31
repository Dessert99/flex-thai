/** 사용량·비용 Zod 계약을 Swagger reflection DTO로 연결한다 */
import {
  operationsCostSettingsResponseSchema,
  updateOperationsCostSettingsRequestSchema,
  usageCostOverviewQuerySchema,
  usageCostOverviewResponseSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 사용량·비용 overview query DTO */
export class UsageCostOverviewQueryDto extends createZodDto(
  usageCostOverviewQuerySchema,
) {}

/** 사용량·비용 overview response DTO */
export class UsageCostOverviewResponseDto extends createZodDto(
  usageCostOverviewResponseSchema,
) {}

/** 비용 경고 설정 response DTO */
export class OperationsCostSettingsResponseDto extends createZodDto(
  operationsCostSettingsResponseSchema,
) {}

/** 비용 경고 설정 변경 request DTO */
export class UpdateOperationsCostSettingsRequestDto extends createZodDto(
  updateOperationsCostSettingsRequestSchema,
) {}
