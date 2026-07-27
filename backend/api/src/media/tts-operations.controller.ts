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
  ttsJobDetailResponseSchema,
  ttsJobItemsQuerySchema,
  ttsJobListQuerySchema,
  ttsJobListResponseSchema,
  ttsJobPathSchema,
  ttsRetryResponseSchema,
  type TtsJobDetailResponse,
  type TtsJobListResponse,
  type TtsRetryResponse,
} from '@flex-thia/contracts';
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

  /** 선택한 retryable 실패 항목을 일괄 재접수한다 */
  @ApiOperation({ summary: 'TTS 작업의 실패 항목을 일괄 재시도한다' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  @ApiBody({ type: RetryTtsJobRequestDto })
  @ApiAcceptedResponse({ type: TtsRetryResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post('jobs/:jobId/retry')
  @HttpCode(202)
  async retryJob(
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<TtsRetryResponse> {
    const { jobId } = ttsJobPathSchema.parse(rawPath);
    const { items } = retryTtsJobRequestSchema.parse(rawBody);
    return ttsRetryResponseSchema.parse(
      await this.service.retryJob(jobId, items),
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
    @Param() rawPath: Record<string, unknown>,
    @Body() rawBody: unknown,
  ): Promise<TtsRetryResponse> {
    const { itemId } = ttsItemPathSchema.parse(rawPath);
    const request = retryTtsItemRequestSchema.parse(rawBody);
    return ttsRetryResponseSchema.parse(
      await this.service.retryItem(itemId, request),
    );
  }
}
