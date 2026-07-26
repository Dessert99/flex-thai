/** 인증 학습자의 콘텐츠 오류 신고 HTTP 경계를 제공한다 */
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  createContentErrorReportRequestSchema,
  type CreateContentErrorReportResponse,
} from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import {
  CreateContentErrorReportRequestDto,
  CreateContentErrorReportResponseDto,
} from './content-error-report.openapi.dto.js';
import { ContentErrorReportHttpService } from './content-error-report.service.js';

/** LEARNER와 상속된 ADMIN이 사용하는 오류 신고 endpoint */
@ApiTags('Content Error Reports')
@ApiBearerAuth('accessToken')
@Controller()
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard)
@RequireRole('LEARNER')
export class LearnerContentErrorReportsController {
  constructor(private readonly reports: ContentErrorReportHttpService) {}

  /** 현재 사용자와 서버 canonical target으로 신고한다 */
  @ApiOperation({ summary: '현재 콘텐츠의 오류를 신고한다' })
  @ApiBody({ type: CreateContentErrorReportRequestDto })
  @ApiCreatedResponse({ type: CreateContentErrorReportResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Post('content-error-reports')
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<CreateContentErrorReportResponse> {
    return this.reports.create(
      user.userId,
      createContentErrorReportRequestSchema.parse(body),
    );
  }
}
