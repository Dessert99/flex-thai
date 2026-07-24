/** 관리자 문제 모든 상태 조회와 버전 수명 command HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  adminQuestionDetailResponseSchema,
  adminQuestionIdPathSchema,
  adminQuestionListQuerySchema,
  adminQuestionListResponseSchema,
  adminQuestionValidationReportSchema,
  adminQuestionVersionIdPathSchema,
  adminQuestionVersionPayloadSchema,
  adminQuestionVersionResponseSchema,
  type AdminQuestionDetailResponse,
  type AdminQuestionListResponse,
  type AdminQuestionValidationReport,
  type AdminQuestionVersionResponse,
} from '@flex-thia/contracts';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import {
  AdminQuestionDetailResponseDto,
  AdminQuestionIdPathDto,
  AdminQuestionListQueryDto,
  AdminQuestionListResponseDto,
  AdminQuestionValidationReportDto,
  AdminQuestionVersionIdPathDto,
  AdminQuestionVersionPayloadDto,
  AdminQuestionVersionResponseDto,
  ProblemDetailsDto,
} from '../openapi/openapi.dto.js';
import {
  AdminContentService,
  createAdminActorContext,
  parseAdminPublicResponse,
} from './admin-content.service.js';
import { AdminRequestId } from './admin-request-id.js';

/** ADMIN과 TOTP 등록을 요구하는 문제 관리 endpoint */
@ApiTags('Admin Questions')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  AdminQuestionListQueryDto,
  AdminQuestionListResponseDto,
  AdminQuestionDetailResponseDto,
  AdminQuestionIdPathDto,
  AdminQuestionVersionIdPathDto,
  AdminQuestionVersionPayloadDto,
  AdminQuestionVersionResponseDto,
  AdminQuestionValidationReportDto,
)
@Controller('admin')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminQuestionsController {
  constructor(private readonly admin: AdminContentService) {}

  /** 모든 문제 상태와 latest version 조건을 stable page로 조회한다 */
  @ApiOperation({ summary: '모든 상태의 문제와 latest version을 조회한다' })
  @ApiQuery({ type: AdminQuestionListQueryDto })
  @ApiOkResponse({ type: AdminQuestionListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get('questions')
  async listQuestions(
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<AdminQuestionListResponse> {
    const query = adminQuestionListQuerySchema.parse(rawQuery);
    return parseAdminPublicResponse(
      adminQuestionListResponseSchema,
      await this.admin.listQuestions(query),
    );
  }

  /** 문제의 모든 버전·검증·정답 option ID를 조회한다 */
  @ApiOperation({ summary: '문제의 모든 버전과 검증 결과를 조회한다' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: AdminQuestionDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get('questions/:questionId')
  async getQuestion(
    @Param() rawPath: Record<string, unknown>,
  ): Promise<AdminQuestionDetailResponse> {
    const path = adminQuestionIdPathSchema.parse(rawPath);
    return parseAdminPublicResponse(
      adminQuestionDetailResponseSchema,
      await this.admin.getQuestion(path.questionId),
    );
  }

  /** 현재 게시 또는 latest version을 복제해 새 DRAFT를 만든다 */
  @ApiOperation({ summary: '현재 문제에서 새 DRAFT 버전을 복제한다' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiCreatedResponse({ type: AdminQuestionVersionResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post('questions/:questionId/versions')
  @HttpCode(201)
  async cloneQuestionVersion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<AdminQuestionVersionResponse> {
    const path = adminQuestionIdPathSchema.parse(rawPath);
    return parseAdminPublicResponse(
      adminQuestionVersionResponseSchema,
      await this.admin.cloneQuestionVersion(
        createAdminActorContext(user, requestId),
        path.questionId,
      ),
    );
  }

  /** DRAFT 버전을 strict canonical payload로 전체 교체한다 */
  @ApiOperation({ summary: 'DRAFT 문제 버전을 canonical payload로 교체한다' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiBody({ type: AdminQuestionVersionPayloadDto })
  @ApiOkResponse({ type: AdminQuestionVersionResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Put('question-versions/:versionId')
  async replaceQuestionVersion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<AdminQuestionVersionResponse> {
    const path = adminQuestionVersionIdPathSchema.parse(rawPath);
    const body = adminQuestionVersionPayloadSchema.parse(rawBody);
    return parseAdminPublicResponse(
      adminQuestionVersionResponseSchema,
      await this.admin.replaceQuestionVersion(
        createAdminActorContext(user, requestId),
        path.versionId,
        body,
      ),
    );
  }

  /** 최신 참조 상태의 FAILED도 200 보고서로 반환한다 */
  @ApiOperation({ summary: '최신 참조 상태로 문제 버전을 검증한다' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: AdminQuestionValidationReportDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Post('question-versions/:versionId/validate')
  @HttpCode(200)
  async validateQuestionVersion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<AdminQuestionValidationReport> {
    const path = adminQuestionVersionIdPathSchema.parse(rawPath);
    return parseAdminPublicResponse(
      adminQuestionValidationReportSchema,
      await this.admin.validateQuestionVersion(
        createAdminActorContext(user, requestId),
        path.versionId,
      ),
    );
  }

  /** 검증된 DRAFT를 게시하고 body 없는 204를 반환한다 */
  @ApiOperation({ summary: '검증된 DRAFT 문제 버전을 게시한다' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post('question-versions/:versionId/publish')
  @HttpCode(204)
  async publishQuestionVersion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = adminQuestionVersionIdPathSchema.parse(rawPath);
    await this.admin.publishQuestionVersion(
      createAdminActorContext(user, requestId),
      path.versionId,
    );
  }

  /** 현재 게시 버전을 무효화하고 문제를 숨긴 뒤 204를 반환한다 */
  @ApiOperation({ summary: '현재 게시 문제 버전을 무효화한다' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post('question-versions/:versionId/invalidate')
  @HttpCode(204)
  async invalidateQuestionVersion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = adminQuestionVersionIdPathSchema.parse(rawPath);
    await this.admin.invalidateQuestionVersion(
      createAdminActorContext(user, requestId),
      path.versionId,
    );
  }

  /** 게시 문제를 즉시 숨기고 body 없는 204를 반환한다 */
  @ApiOperation({ summary: '게시 문제를 즉시 숨긴다' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post('questions/:questionId/hide')
  @HttpCode(204)
  async hideQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = adminQuestionIdPathSchema.parse(rawPath);
    await this.admin.hideQuestion(
      createAdminActorContext(user, requestId),
      path.questionId,
    );
  }

  /** 유효한 current version의 숨김 문제를 복구하고 204를 반환한다 */
  @ApiOperation({ summary: '유효한 현재 버전의 숨김 문제를 복구한다' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post('questions/:questionId/restore')
  @HttpCode(204)
  async restoreQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = adminQuestionIdPathSchema.parse(rawPath);
    await this.admin.restoreQuestion(
      createAdminActorContext(user, requestId),
      path.questionId,
    );
  }
}
