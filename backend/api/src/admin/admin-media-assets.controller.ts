/** 관리자 audio upload 준비·완료·상태 조회 HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  audioUploadRequestSchema,
  audioUploadResponseSchema,
  completeMediaAssetResponseSchema,
  mediaAssetDetailResponseSchema,
  mediaAssetIdPathSchema,
  type AudioUploadResponse,
  type AudioUploadRequest,
  type CompleteMediaAssetResponse,
  type MediaAssetDetailResponse,
} from '@flex-thia/contracts';
import { MediaAssetDomainError } from '@flex-thia/domain';
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
  AudioUploadRequestDto,
  AudioUploadResponseDto,
  CompleteMediaAssetResponseDto,
  MediaAssetDetailResponseDto,
  MediaAssetIdPathDto,
  ProblemDetailsDto,
} from '../openapi/openapi.dto.js';
import {
  AdminContentService,
  createAdminActorContext,
  parseAdminPublicResponse,
} from './admin-content.service.js';
import { AdminRequestId } from './admin-request-id.js';

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

/** 초과 숫자 크기만 stable 413 domain 오류로 승격하고 나머지는 strict 400에 둔다 */
export const parseAudioUploadRequest = (
  rawBody: unknown,
): AudioUploadRequest => {
  if (
    typeof rawBody === 'object' &&
    rawBody !== null &&
    'sizeBytes' in rawBody &&
    typeof rawBody.sizeBytes === 'number' &&
    rawBody.sizeBytes > MAX_AUDIO_SIZE_BYTES
  ) {
    throw new MediaAssetDomainError('MEDIA_UPLOAD_TOO_LARGE');
  }
  return audioUploadRequestSchema.parse(rawBody);
};

/** ADMIN과 TOTP 등록을 요구하는 불변 audio asset endpoint */
@ApiTags('Admin Media Assets')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  AudioUploadRequestDto,
  AudioUploadResponseDto,
  MediaAssetIdPathDto,
  CompleteMediaAssetResponseDto,
  MediaAssetDetailResponseDto,
)
@Controller('admin/media-assets')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class AdminMediaAssetsController {
  constructor(private readonly admin: AdminContentService) {}

  /** 검증된 선언값으로 exact-key presigned upload 또는 READY 재사용을 반환한다 */
  @ApiOperation({ summary: 'audio upload form 또는 READY 재사용을 준비한다' })
  @ApiBody({ type: AudioUploadRequestDto })
  @ApiCreatedResponse({ type: AudioUploadResponseDto })
  @ApiProblemResponses(400, 401, 403, 413, 500)
  @Post('audio-upload-requests')
  @HttpCode(201)
  async requestAudioUpload(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Body() rawBody: unknown,
  ): Promise<AudioUploadResponse> {
    const body = parseAudioUploadRequest(rawBody);
    return parseAdminPublicResponse(
      audioUploadResponseSchema,
      await this.admin.requestAudioUpload(
        createAdminActorContext(user, requestId),
        body,
      ),
    );
  }

  /** 실제 object를 다시 검사해 READY로 seal한 결과를 반환한다 */
  @ApiOperation({ summary: '실제 audio object를 검사해 READY로 완료한다' })
  @ApiParam({ name: 'mediaAssetId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: CompleteMediaAssetResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post(':mediaAssetId/complete')
  @HttpCode(200)
  async completeMediaAsset(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<CompleteMediaAssetResponse> {
    const path = mediaAssetIdPathSchema.parse(rawPath);
    return parseAdminPublicResponse(
      completeMediaAssetResponseSchema,
      await this.admin.completeMediaAsset(
        createAdminActorContext(user, requestId),
        path.mediaAssetId,
      ),
    );
  }

  /** storage key 없는 asset 상태와 발음·문장 사용처를 조회한다 */
  @ApiOperation({ summary: 'audio asset 상태와 사용처를 조회한다' })
  @ApiParam({ name: 'mediaAssetId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: MediaAssetDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get(':mediaAssetId')
  async getMediaAsset(
    @Param() rawPath: Record<string, unknown>,
  ): Promise<MediaAssetDetailResponse> {
    const path = mediaAssetIdPathSchema.parse(rawPath);
    return parseAdminPublicResponse(
      mediaAssetDetailResponseSchema,
      await this.admin.getMediaAsset(path.mediaAssetId),
    );
  }
}
