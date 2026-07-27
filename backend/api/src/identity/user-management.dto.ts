/** 사용자 관리 endpoint의 module-local Swagger DTO를 정의한다 */
import {
  betaInvitationRequestSchema,
  betaInvitationResponseSchema,
  managedIdentityUserResponseSchema,
  userManagementListQuerySchema,
  userManagementListResponseSchema,
  userRoleUpdateRequestSchema,
  userStatusUpdateRequestSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 사용자 검색 query DTO */
export class UserManagementListQueryDto extends createZodDto(
  userManagementListQuerySchema,
) {}

/** 사용자 페이지 응답 DTO */
export class UserManagementListResponseDto extends createZodDto(
  userManagementListResponseSchema,
) {}

/** 사용자 응답 DTO */
export class ManagedIdentityUserResponseDto extends createZodDto(
  managedIdentityUserResponseSchema,
) {}

/** 상태 변경 DTO */
export class UserStatusUpdateRequestDto extends createZodDto(
  userStatusUpdateRequestSchema,
) {}

/** 역할 변경 DTO */
export class UserRoleUpdateRequestDto extends createZodDto(
  userRoleUpdateRequestSchema,
) {}

/** beta 안내 요청 DTO */
export class BetaInvitationRequestDto extends createZodDto(
  betaInvitationRequestSchema,
) {}

/** beta 안내 응답 DTO */
export class BetaInvitationResponseDto extends createZodDto(
  betaInvitationResponseSchema,
) {}
