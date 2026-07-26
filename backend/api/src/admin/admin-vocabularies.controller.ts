/** 관리자 어휘 모든 상태 조회·전체 교체·공개 수명 HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Delete,
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
  adminVocabularyDetailResponseSchema,
  adminVocabularyIdPathSchema,
  adminVocabularyListQuerySchema,
  adminVocabularyListResponseSchema,
  adminVocabularyReplaceRequestSchema,
  adminVocabularyMergeExecuteRequestSchema,
  adminVocabularyMergePreviewRequestSchema,
  adminVocabularyMergePreviewResponseSchema,
  adminVocabularyMergeResponseSchema,
  adminVocabularyRelationCreateRequestSchema,
  adminVocabularyRelationPathSchema,
  adminVocabularyRelationSchema,
  adminVocabularyRelationUpdateRequestSchema,
  type AdminVocabularyMergePreviewResponse,
  type AdminVocabularyMergeResponse,
  type AdminVocabularyRelation,
  type AdminVocabularyDetailResponse,
  type AdminVocabularyListResponse,
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
  AdminVocabularyDetailResponseDto,
  AdminVocabularyIdPathDto,
  AdminVocabularyListQueryDto,
  AdminVocabularyListResponseDto,
  AdminVocabularyReplaceRequestDto,
  AdminVocabularyMergeExecuteRequestDto,
  AdminVocabularyMergePreviewRequestDto,
  AdminVocabularyMergePreviewResponseDto,
  AdminVocabularyMergeResponseDto,
  AdminVocabularyRelationCreateRequestDto,
  AdminVocabularyRelationDto,
  AdminVocabularyRelationPathDto,
  AdminVocabularyRelationUpdateRequestDto,
  ProblemDetailsDto,
} from '../openapi/openapi.dto.js';
import {
  AdminContentService,
  createAdminActorContext,
  parseAdminPublicResponse,
} from './admin-content.service.js';

/** ADMIN과 TOTP 등록을 요구하는 어휘 관리 endpoint */
@ApiTags('Admin Vocabularies')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  AdminVocabularyListQueryDto,
  AdminVocabularyListResponseDto,
  AdminVocabularyDetailResponseDto,
  AdminVocabularyIdPathDto,
  AdminVocabularyReplaceRequestDto,
  AdminVocabularyRelationPathDto,
  AdminVocabularyRelationCreateRequestDto,
  AdminVocabularyRelationUpdateRequestDto,
  AdminVocabularyRelationDto,
  AdminVocabularyMergePreviewRequestDto,
  AdminVocabularyMergePreviewResponseDto,
  AdminVocabularyMergeExecuteRequestDto,
  AdminVocabularyMergeResponseDto,
)
@Controller('admin/vocabularies')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminVocabulariesController {
  constructor(private readonly admin: AdminContentService) {}

  /** 모든 어휘 상태와 정규화 표기 조건을 stable page로 조회한다 */
  @ApiOperation({ summary: '모든 상태의 어휘를 검색한다' })
  @ApiQuery({ type: AdminVocabularyListQueryDto })
  @ApiOkResponse({ type: AdminVocabularyListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get()
  async listVocabularies(
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<AdminVocabularyListResponse> {
    const query = adminVocabularyListQuerySchema.parse(rawQuery);
    return parseAdminPublicResponse(
      adminVocabularyListResponseSchema,
      await this.admin.listVocabularies(query),
    );
  }

  /** 뜻·발음 mapping과 문장·문제 version 사용처를 조회한다 */
  @ApiOperation({ summary: '관리자 어휘 상세와 사용처를 조회한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: AdminVocabularyDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get(':vocabularyId')
  async getVocabulary(
    @Param() rawPath: Record<string, unknown>,
  ): Promise<AdminVocabularyDetailResponse> {
    const path = adminVocabularyIdPathSchema.parse(rawPath);
    return parseAdminPublicResponse(
      adminVocabularyDetailResponseSchema,
      await this.admin.getVocabulary(path.vocabularyId),
    );
  }

  /** 미사용 DRAFT 어휘 child graph를 전체 교체하고 204를 반환한다 */
  @ApiOperation({ summary: '미사용 DRAFT 어휘 전체를 교체한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiBody({ type: AdminVocabularyReplaceRequestDto })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Put(':vocabularyId')
  @HttpCode(204)
  async replaceVocabulary(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<void> {
    const path = adminVocabularyIdPathSchema.parse(rawPath);
    const body = adminVocabularyReplaceRequestSchema.parse(rawBody);
    await this.admin.replaceVocabulary(
      createAdminActorContext(user, requestId),
      path.vocabularyId,
      body,
    );
  }

  /** READY 발음을 가진 DRAFT 어휘를 게시하고 204를 반환한다 */
  @ApiOperation({ summary: 'READY 발음을 가진 DRAFT 어휘를 게시한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':vocabularyId/publish')
  @HttpCode(204)
  async publishVocabulary(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = adminVocabularyIdPathSchema.parse(rawPath);
    await this.admin.publishVocabulary(
      createAdminActorContext(user, requestId),
      path.vocabularyId,
    );
  }

  /** 게시 어휘를 참조 보존 HIDDEN으로 바꾸고 204를 반환한다 */
  @ApiOperation({ summary: '게시 어휘를 숨긴다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':vocabularyId/hide')
  @HttpCode(204)
  async hideVocabulary(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = adminVocabularyIdPathSchema.parse(rawPath);
    await this.admin.hideVocabulary(
      createAdminActorContext(user, requestId),
      path.vocabularyId,
    );
  }

  /** 숨김 어휘를 다시 게시 상태로 복구하고 204를 반환한다 */
  @ApiOperation({ summary: '숨김 어휘를 게시 상태로 복구한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':vocabularyId/restore')
  @HttpCode(204)
  async restoreVocabulary(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = adminVocabularyIdPathSchema.parse(rawPath);
    await this.admin.restoreVocabulary(
      createAdminActorContext(user, requestId),
      path.vocabularyId,
    );
  }

  /** 새 뜻 관계를 PENDING으로 생성한다 */
  @ApiOperation({ summary: '어휘 뜻 관계를 생성한다' })
  @ApiParam({ name: 'vocabularyId', type: 'string', format: 'uuid' })
  @ApiBody({ type: AdminVocabularyRelationCreateRequestDto })
  @ApiCreatedResponse({ type: AdminVocabularyRelationDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':vocabularyId/relations')
  async createRelation(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<AdminVocabularyRelation> {
    const path = adminVocabularyIdPathSchema.parse(rawPath);
    const body = adminVocabularyRelationCreateRequestSchema.parse(rawBody);
    return parseAdminPublicResponse(
      adminVocabularyRelationSchema,
      await this.admin.createVocabularyRelation(
        createAdminActorContext(user, requestId),
        path.vocabularyId,
        body,
      ),
    );
  }

  /** 관계 메타데이터 또는 검토 상태를 변경한다 */
  @ApiOperation({ summary: '어휘 뜻 관계를 수정한다' })
  @ApiBody({ type: AdminVocabularyRelationUpdateRequestDto })
  @ApiOkResponse({ type: AdminVocabularyRelationDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Put(':vocabularyId/relations/:relationId')
  async updateRelation(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<AdminVocabularyRelation> {
    const path = adminVocabularyRelationPathSchema.parse(rawPath);
    const body = adminVocabularyRelationUpdateRequestSchema.parse(rawBody);
    return parseAdminPublicResponse(
      adminVocabularyRelationSchema,
      await this.admin.updateVocabularyRelation(
        createAdminActorContext(user, requestId),
        path.vocabularyId,
        path.relationId,
        body,
      ),
    );
  }

  /** 경로 어휘에 연결된 관계를 삭제한다 */
  @ApiOperation({ summary: '어휘 뜻 관계를 삭제한다' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Delete(':vocabularyId/relations/:relationId')
  @HttpCode(204)
  async deleteRelation(
    @Param() rawPath: Record<string, unknown>,
  ): Promise<void> {
    const path = adminVocabularyRelationPathSchema.parse(rawPath);
    await this.admin.deleteVocabularyRelation(
      path.vocabularyId,
      path.relationId,
    );
  }

  /** 두 live graph와 사용처·정규화 비교 token을 반환한다 */
  @ApiOperation({ summary: '어휘 병합을 미리 비교한다' })
  @ApiBody({ type: AdminVocabularyMergePreviewRequestDto })
  @ApiOkResponse({ type: AdminVocabularyMergePreviewResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':vocabularyId/merge-preview')
  async previewMerge(
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<AdminVocabularyMergePreviewResponse> {
    const path = adminVocabularyIdPathSchema.parse(rawPath);
    const body = adminVocabularyMergePreviewRequestSchema.parse(rawBody);
    return parseAdminPublicResponse(
      adminVocabularyMergePreviewResponseSchema,
      await this.admin.previewVocabularyMerge(path.vocabularyId, body),
    );
  }

  /** 같은 preview token일 때만 source를 대표 어휘로 병합한다 */
  @ApiOperation({ summary: '어휘를 대표 어휘로 병합한다' })
  @ApiBody({ type: AdminVocabularyMergeExecuteRequestDto })
  @ApiOkResponse({ type: AdminVocabularyMergeResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':vocabularyId/merge')
  async mergeVocabulary(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<AdminVocabularyMergeResponse> {
    const path = adminVocabularyIdPathSchema.parse(rawPath);
    const body = adminVocabularyMergeExecuteRequestSchema.parse(rawBody);
    return parseAdminPublicResponse(
      adminVocabularyMergeResponseSchema,
      await this.admin.mergeVocabulary(
        createAdminActorContext(user, requestId),
        path.vocabularyId,
        body,
      ),
    );
  }
}
