/** ADMIN·MFA로 보호한 사용자 상태와 beta 안내 추적 HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  betaInvitationRequestSchema,
  betaInvitationResponseSchema,
  managedIdentityUserResponseSchema,
  userManagementListResponseSchema,
  userManagementListQuerySchema,
  userRoleUpdateRequestSchema,
  userStatusPathSchema,
  userStatusUpdateRequestSchema,
  type BetaInvitationInput,
  type BetaInvitationResponse,
  type ManagedIdentityUserResponse,
  type UserManagementListResponse,
} from '@flex-thia/contracts';
import {
  UserManagementService,
  type ManagedIdentityUser,
  type UserManagementActor,
} from '@flex-thia/domain';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminRequestId } from '../common/http/admin-request-id.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import {
  BetaInvitationRequestDto,
  BetaInvitationResponseDto,
  ManagedIdentityUserResponseDto,
  UserManagementListQueryDto,
  UserManagementListResponseDto,
  UserRoleUpdateRequestDto,
  UserStatusUpdateRequestDto,
} from './user-management.dto.js';
import { AdminMfaGuard } from './admin-mfa.guard.js';
import { ApplicationRoleGuard } from './application-role.guard.js';
import { CognitoAuthorizerGuard } from './cognito-authorizer.guard.js';
import { RequireRole } from './require-role.decorator.js';

/** ADMIN과 TOTP 등록을 요구하는 사용자 관리 endpoint */
@ApiTags('Admin Users')
@ApiBearerAuth('accessToken')
@Controller('admin/users')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminUserManagementController {
  constructor(private readonly users: UserManagementService) {}

  /** 모든 사용자 공개 상태를 이메일 stable 순서로 조회한다 */
  @ApiOperation({ summary: '사용자 활성 상태 목록을 조회한다' })
  @ApiOkResponse({ type: UserManagementListResponseDto })
  @ApiProblemResponses(401, 403, 500)
  @Get()
  async listUsers(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Query() rawQuery: UserManagementListQueryDto,
  ): Promise<UserManagementListResponse> {
    const query = userManagementListQuerySchema.parse(rawQuery);
    const result = await this.users.listUsers(toActor(user, requestId), {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.query ? { query: query.query } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.mfaEnrolled !== undefined
        ? { mfaEnrolled: query.mfaEnrolled }
        : {}),
    });
    return userManagementListResponseSchema.parse({
      items: result.items.map(toResponse),
      page: result.page,
    });
  }

  /** 대상 사용자를 ACTIVE 또는 DISABLED로 변경한다 */
  @ApiOperation({ summary: '사용자 활성 상태를 변경한다' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiBody({ type: UserStatusUpdateRequestDto })
  @ApiOkResponse({ type: ManagedIdentityUserResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Patch(':userId/status')
  async changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: unknown,
    @Body() rawBody: unknown,
  ): Promise<ManagedIdentityUserResponse> {
    const path = userStatusPathSchema.parse(rawPath);
    const body = userStatusUpdateRequestSchema.parse(rawBody);
    const result = await this.users.changeStatus(
      toActor(user, requestId),
      path.userId,
      body.status,
      new Date(),
    );
    return managedIdentityUserResponseSchema.parse(toResponse(result));
  }

  /** 대상 사용자를 LEARNER 또는 ADMIN으로 변경한다 */
  @ApiOperation({ summary: '사용자 역할을 변경한다' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiBody({ type: UserRoleUpdateRequestDto })
  @ApiOkResponse({ type: ManagedIdentityUserResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Patch(':userId/role')
  async changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: unknown,
    @Body() rawBody: unknown,
  ): Promise<ManagedIdentityUserResponse> {
    const path = userStatusPathSchema.parse(rawPath);
    const body = userRoleUpdateRequestSchema.parse(rawBody);
    const result = await this.users.changeRole(
      toActor(user, requestId),
      path.userId,
      body.role,
      new Date(),
    );
    return managedIdentityUserResponseSchema.parse(toResponse(result));
  }

  /** beta 안내 발송을 가입 gate와 무관한 추적 record로 남긴다 */
  @ApiOperation({ summary: 'beta 안내 발송 기록을 남긴다' })
  @ApiBody({ type: BetaInvitationRequestDto })
  @ApiCreatedResponse({ type: BetaInvitationResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Post('invitations')
  async recordBetaInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Body() rawBody: BetaInvitationInput,
  ): Promise<BetaInvitationResponse> {
    const body = betaInvitationRequestSchema.parse(rawBody);
    const record = await this.users.recordBetaInvitation(
      toActor(user, requestId),
      body.email,
      new Date(),
    );
    return betaInvitationResponseSchema.parse({
      ...record,
      sentAt: record.sentAt.toISOString(),
    });
  }
}

const toActor = (
  user: AuthenticatedUser,
  requestId: string,
): UserManagementActor => ({
  actorSub: user.sub,
  actorUserId: user.userId,
  requestId,
  role: user.role,
});

const toResponse = (
  user: ManagedIdentityUser,
): ManagedIdentityUserResponse => ({
  id: user.id,
  email: user.email,
  role: user.role,
  status: user.status,
  mfaEnrolled: user.mfaEnrolledAt !== null,
  mfaEnrolledAt: user.mfaEnrolledAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});
