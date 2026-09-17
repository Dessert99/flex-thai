/** 관리자 문제 CRUD와 공개 상태 HTTP 경계. */
import {
  adminQuestionIdPathSchema,
  adminQuestionListQuerySchema,
  adminQuestionPayloadSchema,
  adminQuestionStatusRequestSchema,
  adminQuestionUpdateRequestSchema,
} from '@flex-thia/contracts/admin/questions';
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
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminRequestId } from '../common/http/admin-request-id.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import {
  AdminContentService,
  createAdminActorContext,
} from './admin-content.service.js';
import {
  AdminQuestionCreateRequestDto,
  AdminQuestionUpdateRequestDto,
  AdminQuestionStatusRequestDto,
  AdminQuestionDetailResponseDto,
  AdminQuestionListQueryDto,
  AdminQuestionListResponseDto,
} from '../openapi/openapi.dto.js';
@ApiTags('Admin Questions')
@ApiBearerAuth('accessToken')
@Controller('admin/questions')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminQuestionsController {
  constructor(private readonly admin: AdminContentService) {}
  @ApiQuery({ type: AdminQuestionListQueryDto })
  @ApiOkResponse({ type: AdminQuestionListResponseDto })
  @Get()
  listQuestions(@Query() query: Record<string, unknown>) {
    return this.admin.listQuestions(adminQuestionListQuerySchema.parse(query));
  }
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: AdminQuestionDetailResponseDto })
  @Get(':questionId')
  getQuestion(@Param() path: Record<string, unknown>) {
    return this.admin.getQuestion(
      adminQuestionIdPathSchema.parse(path).questionId,
    );
  }
  @ApiBody({ type: AdminQuestionCreateRequestDto })
  @ApiCreatedResponse({ type: AdminQuestionDetailResponseDto })
  @Post()
  createQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Body() body: unknown,
  ) {
    return this.admin.createQuestion(
      createAdminActorContext(user, requestId),
      adminQuestionPayloadSchema.parse(body),
    );
  }
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiBody({ type: AdminQuestionUpdateRequestDto })
  @ApiOkResponse({ type: AdminQuestionDetailResponseDto })
  @Put(':questionId')
  updateQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() path: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    return this.admin.updateQuestion(
      createAdminActorContext(user, requestId),
      adminQuestionIdPathSchema.parse(path).questionId,
      adminQuestionUpdateRequestSchema.parse(body),
    );
  }
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiBody({ type: AdminQuestionStatusRequestDto })
  @ApiNoContentResponse()
  @Post(':questionId/status')
  @HttpCode(204)
  changeQuestionStatus(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() path: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    return this.admin.changeQuestionStatus(
      createAdminActorContext(user, requestId),
      adminQuestionIdPathSchema.parse(path).questionId,
      adminQuestionStatusRequestSchema.parse(body),
    );
  }
}
