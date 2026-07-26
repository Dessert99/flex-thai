/** 관리자 개념 조회·버전 수명 command HTTP 경계를 제공한다 */
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
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  adminConceptListQuerySchema,
  conceptIdPathSchema,
  conceptVersionIdPathSchema,
  createConceptRequestSchema,
  replaceConceptVersionRequestSchema,
  type AdminConceptDetailResponse,
  type AdminConceptListResponse,
  type AdminConceptVersion,
  type ConceptValidationReport,
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
  AdminConceptDetailResponseDto,
  AdminConceptListResponseDto,
  ConceptValidationReportDto,
  ConceptVersionResponseDto,
} from './concepts.dto.js';
import { ConceptsService } from './concepts.service.js';

const actorContext = (
  user: AuthenticatedUser,
  requestId: string,
) => ({
  actorSub: user.sub,
  actorUserId: user.userId,
  requestId,
  occurredAt: new Date(),
});

/** ADMIN과 TOTP 등록을 요구하는 개념 관리 endpoint */
@ApiTags('Admin Concepts')
@ApiBearerAuth('accessToken')
@Controller('admin')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminConceptsController {
  constructor(private readonly concepts: ConceptsService) {}

  @Get('concepts')
  @ApiOkResponse({ type: AdminConceptListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  list(@Query() rawQuery: Record<string, unknown>): Promise<AdminConceptListResponse> {
    return this.concepts.listAdmin(adminConceptListQuerySchema.parse(rawQuery));
  }

  @Post('concepts')
  @HttpCode(201)
  @ApiCreatedResponse({ type: ConceptVersionResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  create(@CurrentUser() user: AuthenticatedUser, @AdminRequestId() requestId: string, @Body() rawBody: unknown): Promise<AdminConceptVersion> {
    return this.concepts.create(createConceptRequestSchema.parse(rawBody), actorContext(user, requestId));
  }

  @Get('concepts/:conceptId')
  @ApiOkResponse({ type: AdminConceptDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  detail(@Param() rawPath: Record<string, unknown>): Promise<AdminConceptDetailResponse> {
    return this.concepts.getAdminDetail(conceptIdPathSchema.parse(rawPath).conceptId);
  }

  @Post('concepts/:conceptId/versions')
  @HttpCode(201)
  @ApiCreatedResponse({ type: ConceptVersionResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  nextDraft(@CurrentUser() user: AuthenticatedUser, @AdminRequestId() requestId: string, @Param() rawPath: Record<string, unknown>): Promise<AdminConceptVersion> {
    return this.concepts.createNextDraft(conceptIdPathSchema.parse(rawPath).conceptId, actorContext(user, requestId));
  }

  @Put('concept-versions/:versionId')
  @ApiOkResponse({ type: ConceptVersionResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  replace(@CurrentUser() user: AuthenticatedUser, @AdminRequestId() requestId: string, @Param() rawPath: Record<string, unknown>, @Body() rawBody: unknown): Promise<AdminConceptVersion> {
    return this.concepts.replace(conceptVersionIdPathSchema.parse(rawPath).versionId, replaceConceptVersionRequestSchema.parse(rawBody), actorContext(user, requestId));
  }

  @Post('concept-versions/:versionId/validate')
  @ApiOkResponse({ type: ConceptValidationReportDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  validate(@CurrentUser() user: AuthenticatedUser, @AdminRequestId() requestId: string, @Param() rawPath: Record<string, unknown>): Promise<ConceptValidationReport> {
    return this.concepts.validate(conceptVersionIdPathSchema.parse(rawPath).versionId, actorContext(user, requestId));
  }

  @Post('concept-versions/:versionId/publish')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  publish(@CurrentUser() user: AuthenticatedUser, @AdminRequestId() requestId: string, @Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.concepts.publish(conceptVersionIdPathSchema.parse(rawPath).versionId, actorContext(user, requestId));
  }

  @Post('concepts/:conceptId/hide')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  hide(@CurrentUser() user: AuthenticatedUser, @AdminRequestId() requestId: string, @Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.concepts.hide(conceptIdPathSchema.parse(rawPath).conceptId, actorContext(user, requestId));
  }

  @Post('concepts/:conceptId/restore')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  restore(@CurrentUser() user: AuthenticatedUser, @AdminRequestId() requestId: string, @Param() rawPath: Record<string, unknown>): Promise<void> {
    return this.concepts.restore(conceptIdPathSchema.parse(rawPath).conceptId, actorContext(user, requestId));
  }
}
