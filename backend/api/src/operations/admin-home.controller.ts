/** ADMIN+MFA 관리자 홈 운영 집계 HTTP 경계를 제공한다 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminHomeOperationsResponse } from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import { AdminHomeOperationsResponseDto } from './admin-home.dto.js';
import { AdminHomeService } from './admin-home.service.js';

/** 현재 운영 상태를 노출하는 관리자 홈 endpoint */
@ApiTags('Admin Home')
@ApiBearerAuth('accessToken')
@Controller('admin/home')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminHomeController {
  constructor(private readonly home: AdminHomeService) {}

  /** 페이지 표본이 아닌 전체 운영 집계를 반환한다 */
  @ApiOperation({ summary: '관리자 홈 운영 상태를 조회한다' })
  @ApiOkResponse({ type: AdminHomeOperationsResponseDto })
  @ApiProblemResponses(401, 403, 500)
  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminHomeOperationsResponse> {
    return this.home.get({
      userId: user.userId,
      role: 'ADMIN',
      mfaEnrolledAt: user.mfaEnrolledAt,
    });
  }
}
