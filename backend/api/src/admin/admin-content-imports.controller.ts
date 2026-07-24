/** 관리자 canonical 콘텐츠 가져오기 생성·이력 HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  contentImportDetailResponseSchema,
  contentImportIdPathSchema,
  contentImportListQuerySchema,
  contentImportListResponseSchema,
  contentImportRequestSchema,
  idempotencyKeyHeaderSchema,
  type ContentImportDetailResponse,
  type ContentImportListResponse,
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
  ContentImportDetailResponseDto,
  ContentImportIdPathDto,
  ContentImportListQueryDto,
  ContentImportListResponseDto,
  ContentImportRequestDto,
  ProblemDetailsDto,
} from '../openapi/openapi.dto.js';
import {
  AdminContentService,
  createAdminActorContext,
  parseAdminPublicResponse,
} from './admin-content.service.js';

/** ADMIN과 TOTP 등록을 요구하는 콘텐츠 가져오기 endpoint */
@ApiTags('Admin Content Imports')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  ContentImportRequestDto,
  ContentImportListQueryDto,
  ContentImportIdPathDto,
  ContentImportDetailResponseDto,
  ContentImportListResponseDto,
)
@Controller('admin/content-imports')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminContentImportsController {
  constructor(private readonly admin: AdminContentService) {}

  /** UUID 멱등 key와 strict canonical JSON을 동기 초안으로 가져온다 */
  @ApiOperation({ summary: 'canonical JSON을 항목별 초안으로 가져온다' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ type: ContentImportRequestDto })
  @ApiCreatedResponse({ type: ContentImportDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 409, 413, 429, 500)
  @Post()
  @HttpCode(201)
  async createContentImport(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() rawBody: unknown,
  ): Promise<ContentImportDetailResponse> {
    const header = idempotencyKeyHeaderSchema.parse({
      'idempotency-key': idempotencyKey,
    });
    const body = contentImportRequestSchema.parse(rawBody);
    return parseAdminPublicResponse(
      contentImportDetailResponseSchema,
      await this.admin.createContentImport(
        createAdminActorContext(user, requestId),
        header['idempotency-key'],
        body,
      ),
    );
  }

  /** 완료된 전체 가져오기 이력을 stable page로 조회한다 */
  @ApiOperation({ summary: '완료된 콘텐츠 가져오기 이력을 조회한다' })
  @ApiQuery({ type: ContentImportListQueryDto })
  @ApiOkResponse({ type: ContentImportListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get()
  async listContentImports(
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<ContentImportListResponse> {
    const query = contentImportListQuerySchema.parse(rawQuery);
    return parseAdminPublicResponse(
      contentImportListResponseSchema,
      await this.admin.listContentImports(query),
    );
  }

  /** 완료된 가져오기 항목별 성공·실패 상세를 조회한다 */
  @ApiOperation({ summary: '콘텐츠 가져오기 항목별 결과를 조회한다' })
  @ApiParam({ name: 'importId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: ContentImportDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get(':importId')
  async getContentImport(
    @Param() rawPath: Record<string, unknown>,
  ): Promise<ContentImportDetailResponse> {
    const path = contentImportIdPathSchema.parse(rawPath);
    return parseAdminPublicResponse(
      contentImportDetailResponseSchema,
      await this.admin.getContentImport(path.importId),
    );
  }
}
