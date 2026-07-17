/** 인증된 사용자의 Job 생성과 조회를 HTTP 계약으로 제공한다 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createJobRequestSchema,
  type CreateJobRequest,
  type JobResponse,
} from '@flex-thia/contracts';
import type { Job } from '@flex-thia/domain';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator.js';
import { ApplicationRoleGuard } from '../auth/application-role.guard.js';
import { RequireRole } from '../auth/require-role.decorator.js';
import { RequireStepUp } from '../auth/require-step-up.decorator.js';
import { RequireStepUpGuard } from '../auth/require-step-up.guard.js';
import { JobsService } from './jobs.service.js';

const toJobResponse = (job: Job): JobResponse => ({
  id: job.id,
  status: job.status,
  attempt: job.attempt,
  createdAt: job.createdAt.toISOString(),
});

/** 비동기 콘텐츠 작업 API */
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /** 긴 작업을 기다리지 않고 queue 접수 결과를 반환한다 */
  @Post()
  @HttpCode(202)
  @UseGuards(ApplicationRoleGuard, RequireStepUpGuard)
  @RequireRole('ADMIN')
  @RequireStepUp('AI_BULK_CREATE')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateJobRequest,
  ): Promise<JobResponse> {
    const result = createJobRequestSchema.safeParse(body);

    if (!result.success) {
      throw new BadRequestException({ code: 'INVALID_JOB_REQUEST' });
    }

    const job = await this.jobsService.create({
      ...result.data,
      requestedBy: user.userId,
    });
    return toJobResponse(job);
  }

  /** 관리자 화면 polling용 현재 Job 상태를 반환한다 */
  @Get(':jobId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ): Promise<JobResponse> {
    const job = await this.jobsService.getOwnedJob(user.userId, jobId);
    return toJobResponse(job);
  }
}
