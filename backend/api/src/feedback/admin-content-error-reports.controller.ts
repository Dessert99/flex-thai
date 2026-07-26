/** ADMIN MFA로 보호된 콘텐츠 오류 신고 처리 HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  adminContentErrorReportListQuerySchema,
  assignContentErrorReportRequestSchema,
  changeContentErrorReportStatusRequestSchema,
  contentErrorReportIdPathSchema,
} from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminRequestId } from '../common/http/admin-request-id.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import {
  AdminContentErrorReportDetailResponseDto,
  AdminContentErrorReportListQueryDto,
  AdminContentErrorReportListResponseDto,
  AssignContentErrorReportRequestDto,
  ChangeContentErrorReportStatusRequestDto,
} from './content-error-report.openapi.dto.js';
import { ContentErrorReportHttpService } from './content-error-report.service.js';

/** ADMIN과 TOTP 등록을 요구하는 오류 신고 관리 endpoint */
@ApiTags('Admin Content Error Reports')
@ApiBearerAuth('accessToken')
@Controller('admin/content-error-reports')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminContentErrorReportsController {
  constructor(private readonly reports: ContentErrorReportHttpService) {}

  /** 필터와 stable page로 신고를 조회한다 */
  @Get()
  @ApiOperation({ summary: '콘텐츠 오류 신고를 조회한다' })
  @ApiQuery({ type: AdminContentErrorReportListQueryDto })
  @ApiOkResponse({ type: AdminContentErrorReportListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  list(@Query() query: Record<string, unknown>) {
    return this.reports.list(
      adminContentErrorReportListQuerySchema.parse(query),
    );
  }

  /** immutable snapshot과 처리 이력을 조회한다 */
  @Get(':reportId')
  @ApiOperation({ summary: '콘텐츠 오류 신고 상세와 이력을 조회한다' })
  @ApiParam({ name: 'reportId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminContentErrorReportDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  detail(@Param() path: Record<string, unknown>) {
    return this.reports.detail(
      contentErrorReportIdPathSchema.parse(path).reportId,
    );
  }

  /** 허용된 상태로 전이한다 */
  @Put(':reportId/status')
  @ApiOperation({ summary: '콘텐츠 오류 신고 상태를 변경한다' })
  @ApiParam({ name: 'reportId', type: String, format: 'uuid' })
  @ApiBody({ type: ChangeContentErrorReportStatusRequestDto })
  @ApiOkResponse({ type: AdminContentErrorReportDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() path: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    const actor = { userId: user.userId, actorSub: user.sub, requestId };
    return this.reports.changeStatus(
      actor,
      contentErrorReportIdPathSchema.parse(path).reportId,
      changeContentErrorReportStatusRequestSchema.parse(body).status,
    );
  }

  /** ACTIVE ADMIN을 담당자로 배정한다 */
  @Put(':reportId/assignee')
  @ApiOperation({ summary: '콘텐츠 오류 신고 담당자를 배정한다' })
  @ApiParam({ name: 'reportId', type: String, format: 'uuid' })
  @ApiBody({ type: AssignContentErrorReportRequestDto })
  @ApiOkResponse({ type: AdminContentErrorReportDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() path: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    return this.reports.assign(
      { userId: user.userId, actorSub: user.sub, requestId },
      contentErrorReportIdPathSchema.parse(path).reportId,
      assignContentErrorReportRequestSchema.parse(body).assigneeUserId,
    );
  }

  /** 현재 담당자를 해제한다 */
  @Delete(':reportId/assignee')
  @ApiOperation({ summary: '콘텐츠 오류 신고 담당자를 해제한다' })
  @ApiParam({ name: 'reportId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminContentErrorReportDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  unassign(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() path: Record<string, unknown>,
  ) {
    return this.reports.unassign(
      { userId: user.userId, actorSub: user.sub, requestId },
      contentErrorReportIdPathSchema.parse(path).reportId,
    );
  }
}
