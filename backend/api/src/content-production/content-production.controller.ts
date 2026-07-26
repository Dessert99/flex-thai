/** ADMIN+MFA 콘텐츠 제작 upload·preset·작업 HTTP 경계를 제공한다 */
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  completedUploadResponseSchema,
  contentProductionJobDetailResponseSchema,
  contentProductionJobListQuerySchema,
  contentProductionJobListResponseSchema,
  contentProductionJobPathSchema,
  contentProductionJobSummarySchema,
  contentProductionPresetListResponseSchema,
  contentProductionUploadPathSchema,
  createContentProductionJobRequestSchema,
  uploadPolicyRequestSchema,
  uploadPolicyResponseSchema,
  type ContentProductionJobDetailResponse,
} from '@flex-thia/contracts';
import {
  ContentProductionDomainError,
  type ContentProductionJob,
} from '@flex-thia/domain';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { RequireRole } from '../identity/require-role.decorator.js';
import { ApiProblemResponses } from '../openapi/openapi.decorators.js';
import { ProblemDetailsDto } from '../openapi/openapi.dto.js';
import {
  CompletedContentProductionUploadResponseDto,
  ContentProductionJobDetailResponseDto,
  ContentProductionJobListQueryDto,
  ContentProductionJobListResponseDto,
  ContentProductionJobPathDto,
  ContentProductionJobSummaryDto,
  ContentProductionPresetListResponseDto,
  ContentProductionUploadPathDto,
  ContentProductionUploadPolicyRequestDto,
  ContentProductionUploadPolicyResponseDto,
  CreateContentProductionJobRequestDto,
} from './content-production.dto.js';
import {
  ContentProductionApplicationError,
  ContentProductionApplicationService,
} from './content-production.service.js';

const toJobSummary = (job: ContentProductionJob) =>
  contentProductionJobSummarySchema.parse({
    id: job.id,
    purpose: job.purpose,
    status: job.status,
    attempt: job.attempt,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    counts: job.counts,
  });

const toJobDetail = (
  job: ContentProductionJob,
): ContentProductionJobDetailResponse =>
  contentProductionJobDetailResponseSchema.parse({
    ...toJobSummary(job),
    presetSnapshot: job.presetSnapshot,
    inputs: job.inputs.map(({ uploadId, inputType, sizeBytes }) => ({
      uploadId,
      inputType,
      sizeBytes,
    })),
    items: job.items.map(({ id, status, attempt, retryable, errorCode }) => ({
      id,
      status,
      attempt,
      retryable,
      errorCode,
    })),
  });

// 기능 소유 오류만 공개 상태로 바꾸고 예상하지 못한 오류는 공통 filter로 전달
const executeContentProductionOperation = async <Result>(
  operation: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof ContentProductionApplicationError &&
      error.code !== 'UPLOAD_SERVICE_NOT_CONFIGURED'
    ) {
      throw new BadRequestException({ code: error.code });
    }

    if (error instanceof ContentProductionDomainError) {
      if (error.code === 'JOB_NOT_FOUND') {
        throw new NotFoundException({ code: error.code });
      }

      if (
        [
          'IDEMPOTENCY_CONFLICT',
          'JOB_NOT_RETRYABLE',
          'JOB_RETRY_LIMIT_EXCEEDED',
        ].includes(error.code)
      ) {
        throw new ConflictException({ code: error.code });
      }

      throw new BadRequestException({ code: error.code });
    }

    throw error;
  }
};

/** ADMIN과 MFA를 요구하는 콘텐츠 제작 endpoint 집합 */
@ApiTags('Admin Content Production')
@ApiBearerAuth('accessToken')
@ApiExtraModels(
  ProblemDetailsDto,
  ContentProductionUploadPolicyRequestDto,
  ContentProductionUploadPolicyResponseDto,
  ContentProductionUploadPathDto,
  CompletedContentProductionUploadResponseDto,
  ContentProductionPresetListResponseDto,
  CreateContentProductionJobRequestDto,
  ContentProductionJobSummaryDto,
  ContentProductionJobListQueryDto,
  ContentProductionJobListResponseDto,
  ContentProductionJobPathDto,
  ContentProductionJobDetailResponseDto,
)
@Controller('admin/content-production')
@UseGuards(CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard)
@RequireRole('ADMIN')
export class ContentProductionController {
  constructor(
    private readonly contentProduction: ContentProductionApplicationService,
  ) {}

  /** private 입력 object의 exact key upload policy를 준비한다 */
  @ApiOperation({ summary: '콘텐츠 제작 입력 upload policy를 준비한다' })
  @ApiBody({ type: ContentProductionUploadPolicyRequestDto })
  @ApiCreatedResponse({ type: ContentProductionUploadPolicyResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Post('uploads/policies')
  @HttpCode(201)
  async createUploadPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rawBody: unknown,
  ) {
    return uploadPolicyResponseSchema.parse(
      await this.contentProduction.createUploadPolicy(
        user.userId,
        uploadPolicyRequestSchema.parse(rawBody),
      ),
    );
  }

  /** 실제 object를 재검사해 VERIFIED 입력으로 완료한다 */
  @ApiOperation({ summary: '콘텐츠 제작 입력 upload를 검사해 완료한다' })
  @ApiParam({ name: 'uploadId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: CompletedContentProductionUploadResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Post('uploads/:uploadId/complete')
  @HttpCode(200)
  async completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ) {
    const { uploadId } = contentProductionUploadPathSchema.parse(rawPath);
    const completed = await this.contentProduction.completeUpload(
      user.userId,
      uploadId,
    );
    return completedUploadResponseSchema.parse({
      uploadId: completed.id,
      inputType: completed.inputType,
      sizeBytes: completed.sizeBytes,
      status: completed.status,
    });
  }

  /** 작업 생성에 사용할 활성 preset 목록을 반환한다 */
  @ApiOperation({ summary: '활성 콘텐츠 제작 preset을 조회한다' })
  @ApiOkResponse({ type: ContentProductionPresetListResponseDto })
  @ApiProblemResponses(401, 403, 500)
  @Get('presets')
  async listPresets() {
    return contentProductionPresetListResponseSchema.parse({
      items: await this.contentProduction.listPresets(),
    });
  }

  /** 검증된 입력과 preset snapshot으로 비동기 작업을 접수한다 */
  @ApiOperation({ summary: '콘텐츠 제작 작업을 생성한다' })
  @ApiBody({ type: CreateContentProductionJobRequestDto })
  @ApiAcceptedResponse({ type: ContentProductionJobSummaryDto })
  @ApiProblemResponses(400, 401, 403, 409, 500)
  @Post('jobs')
  @HttpCode(202)
  async createJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rawBody: unknown,
  ) {
    return toJobSummary(
      await executeContentProductionOperation(() =>
        this.contentProduction.create(
          user.userId,
          createContentProductionJobRequestSchema.parse(rawBody),
        ),
      ),
    );
  }

  /** 관리자가 생성한 최근 작업과 항목 집계를 반환한다 */
  @ApiOperation({ summary: '콘텐츠 제작 작업 목록을 조회한다' })
  @ApiQuery({ type: ContentProductionJobListQueryDto })
  @ApiOkResponse({ type: ContentProductionJobListResponseDto })
  @ApiProblemResponses(400, 401, 403, 500)
  @Get('jobs')
  async listJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() rawQuery: Record<string, unknown>,
  ) {
    const query = contentProductionJobListQuerySchema.parse(rawQuery);
    return contentProductionJobListResponseSchema.parse({
      items: (
        await this.contentProduction.listJobs(user.userId, query.limit)
      ).map(toJobSummary),
    });
  }

  /** storage key와 provider 원문 없는 작업 상세를 반환한다 */
  @ApiOperation({ summary: '콘텐츠 제작 작업 상세를 조회한다' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: ContentProductionJobDetailResponseDto })
  @ApiProblemResponses(400, 401, 403, 404, 500)
  @Get('jobs/:jobId')
  async getJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ): Promise<ContentProductionJobDetailResponse> {
    const { jobId } = contentProductionJobPathSchema.parse(rawPath);
    return toJobDetail(
      await executeContentProductionOperation(() =>
        this.contentProduction.getJob(user.userId, jobId),
      ),
    );
  }

  /** retryable 실패 항목만 다음 attempt로 다시 접수한다 */
  @ApiOperation({ summary: '실패한 콘텐츠 제작 항목을 재시도한다' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  @ApiAcceptedResponse({ type: ContentProductionJobSummaryDto })
  @ApiProblemResponses(400, 401, 403, 404, 409, 500)
  @Post('jobs/:jobId/retry')
  @HttpCode(202)
  async retryJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param() rawPath: Record<string, unknown>,
  ) {
    const { jobId } = contentProductionJobPathSchema.parse(rawPath);
    return toJobSummary(
      await executeContentProductionOperation(() =>
        this.contentProduction.retryJob(user.userId, jobId),
      ),
    );
  }
}
