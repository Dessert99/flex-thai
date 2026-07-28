/** ADMIN·MFA TTS 작업 조회·재시도 HTTP 경계를 제공한다 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  retryTtsItemRequestSchema,
  retryTtsJobRequestSchema,
  ttsItemPathSchema,
  ttsItemAudioResponseSchema,
  ttsJobDetailResponseSchema,
  ttsJobItemsQuerySchema,
  ttsJobListQuerySchema,
  ttsJobListResponseSchema,
  ttsJobPathSchema,
  ttsRetryResponseSchema,
  ttsPublicationReadinessPathSchema,
  ttsPublicationReadinessResponseSchema,
  type TtsItemAudioResponse,
  type TtsPublicationReadinessResponse,
  type TtsJobDetailResponse,
  type TtsJobListResponse,
  type TtsRetryResponse,
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
import { ProblemDetailsDto } from '../openapi/openapi.dto.js';
import {
  RetryTtsItemRequestDto,
  RetryTtsJobRequestDto,
  TtsJobDetailResponseDto,
  TtsJobItemsQueryDto,
  TtsJobListQueryDto,
  TtsJobListResponseDto,
  TtsRetryResponseDto,
  TtsItemAudioResponseDto,
  TtsPublicationReadinessResponseDto,
} from './tts-operations.dto.js';
import { TtsOperationsService } from './tts-operations.service.js';

/** ADMIN과 MFA를 요구하는 TTS 운영 endpoint */
@ApiTags('Admin TTS')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  TtsJobListQueryDto,
  TtsJobItemsQueryDto,
  TtsJobListResponseDto,
  TtsJobDetailResponseDto,
  RetryTtsJobRequestDto,
  RetryTtsItemRequestDto,
  TtsRetryResponseDto,
  TtsItemAudioResponseDto,
  TtsPublicationReadinessResponseDto,
)
@Controller('admin/tts')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class TtsOperationsController {
  constructor(private readonly service: TtsOperationsService) {}

  /** 상태·기간 조건의 TTS 작업 page를 반환한다 */
  @ApiOperation({ summary: 'TTS 작업 목록을 조회한다' })
  @ApiQuery({ type: TtsJobListQueryDto })
  @ApiOkResponse({ type: TtsJobListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get('jobs')
  async listJobs(
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<TtsJobListResponse> {
    const query = ttsJobListQuerySchema.parse(rawQuery);
    return ttsJobListResponseSchema.parse(await this.service.listJobs(query));
  }

  /** voice snapshot과 필터된 TTS 항목 상세를 반환한다 */
  @ApiOperation({ summary: 'TTS 작업 상세를 조회한다' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  @ApiQuery({ type: TtsJobItemsQueryDto })
  @ApiOkResponse({ type: TtsJobDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get('jobs/:jobId')
  async getJob(
    @Param() rawPath: Record<string, unknown>,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<TtsJobDetailResponse> {
    const { jobId } = ttsJobPathSchema.parse(rawPath);
    const query = ttsJobItemsQuerySchema.parse(rawQuery);
    return ttsJobDetailResponseSchema.parse(
      await this.service.getJob(jobId, query),
    );
  }

  /** 성공 TTS 항목의 click-time read URL을 반환한다 */
  @ApiOperation({ summary: 'TTS 항목 음성 재생 URL을 발급한다' })
  @ApiParam({ name: 'itemId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: TtsItemAudioResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Get('items/:itemId/audio')
  async getItemAudio(
    @Param() rawPath: Record<string, unknown>,
  ): Promise<TtsItemAudioResponse> {
    const { itemId } = ttsItemPathSchema.parse(rawPath);
    return ttsItemAudioResponseSchema.parse(
      await this.service.getItemAudio(itemId),
    );
  }

  /** 문제 version의 TTS 게시 readiness와 blocker를 반환한다 */
  @ApiOperation({ summary: '문제 version TTS 게시 readiness를 조회한다' })
  @ApiParam({ name: 'questionId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: TtsPublicationReadinessResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Get('questions/:questionId/versions/:versionId/readiness')
  async getPublicationReadiness(
    @Param() rawPath: Record<string, unknown>,
  ): Promise<TtsPublicationReadinessResponse> {
    const { questionId, versionId } =
      ttsPublicationReadinessPathSchema.parse(rawPath);
    return ttsPublicationReadinessResponseSchema.parse(
      await this.service.getPublicationReadiness(questionId, versionId),
    );
  }

  /** 선택한 retryable 실패 항목을 일괄 재접수한다 */
  @ApiOperation({ summary: 'TTS 작업의 실패 항목을 일괄 재시도한다' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  @ApiBody({ type: RetryTtsJobRequestDto })
  @ApiAcceptedResponse({ type: TtsRetryResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post('jobs/:jobId/retry')
  @HttpCode(202)
  async retryJob(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<TtsRetryResponse> {
    const { jobId } = ttsJobPathSchema.parse(rawPath);
    const { items } = retryTtsJobRequestSchema.parse(rawBody);
    return ttsRetryResponseSchema.parse(
      await this.service.retryJob(
        { userId: user.userId, sub: user.sub, requestId },
        jobId,
        items,
      ),
    );
  }

  /** 선택한 retryable 실패 항목 하나를 재접수한다 */
  @ApiOperation({ summary: 'TTS 실패 항목 하나를 재시도한다' })
  @ApiParam({ name: 'itemId', type: 'string', format: 'uuid' })
  @ApiBody({ type: RetryTtsItemRequestDto })
  @ApiAcceptedResponse({ type: TtsRetryResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post('items/:itemId/retry')
  @HttpCode(202)
  async retryItem(
    @CurrentUser() user: AuthenticatedUser,
    @AdminRequestId() requestId: string,
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<TtsRetryResponse> {
    const { itemId } = ttsItemPathSchema.parse(rawPath);
    const request = retryTtsItemRequestSchema.parse(rawBody);
    return ttsRetryResponseSchema.parse(
      await this.service.retryItem(
        { userId: user.userId, sub: user.sub, requestId },
        itemId,
        request,
      ),
    );
  }
}
