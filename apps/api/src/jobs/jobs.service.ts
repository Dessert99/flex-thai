/** 검증된 upload를 Job command로 바꾸고 소유한 Job만 조회한다 */
import { Injectable } from '@nestjs/common';
import type {
  CreateJobService,
  Job,
  JobRepository,
  JobType,
  UploadRepository,
} from '@flex-thia/domain';

const MAX_JOB_INPUT_BYTES = 250 * 1024 * 1024;

/** Job application 계층에서 HTTP와 분리해 전달하는 오류 */
export class JobApplicationError extends Error {
  constructor(
    readonly code:
      'UPLOAD_NOT_VERIFIED' | 'JOB_INPUT_TOO_LARGE' | 'JOB_NOT_FOUND',
  ) {
    super(code);
    this.name = 'JobApplicationError';
  }
}

/** Controller가 Job 생성에 전달하는 검증 전 입력 */
export interface CreateJobInput {
  requestedBy: string;
  clientRequestId: string;
  type: JobType;
  uploadIds: string[];
}

/** upload 검증과 idempotent Job use case를 연결한다 */
@Injectable()
export class JobsService {
  constructor(
    private readonly uploads: UploadRepository,
    private readonly createJobService: CreateJobService,
    private readonly jobs: JobRepository,
  ) {}

  /** 검증 완료된 실제 S3 크기의 합계가 정책 안일 때만 Job을 만든다 */
  async create(input: CreateJobInput): Promise<Job> {
    const uniqueUploadIds = [...new Set(input.uploadIds)];
    const verifiedUploads = await this.uploads.findVerifiedOwnedByIds(
      input.requestedBy,
      uniqueUploadIds,
    );
    const uploadsById = new Map(
      verifiedUploads.map((upload) => [upload.uploadId, upload]),
    );
    const orderedInputs = uniqueUploadIds.flatMap((uploadId) => {
      const upload = uploadsById.get(uploadId);
      return upload ? [upload] : [];
    });

    if (orderedInputs.length !== uniqueUploadIds.length) {
      throw new JobApplicationError('UPLOAD_NOT_VERIFIED');
    }

    const totalSizeBytes = orderedInputs.reduce(
      (total, upload) => total + upload.sizeBytes,
      0,
    );

    if (totalSizeBytes > MAX_JOB_INPUT_BYTES) {
      throw new JobApplicationError('JOB_INPUT_TOO_LARGE');
    }

    return this.createJobService.execute({
      requestedBy: input.requestedBy,
      clientRequestId: input.clientRequestId,
      type: input.type,
      inputs: orderedInputs,
    });
  }

  /** 다른 사용자의 Job 존재 여부를 숨기며 소유한 Job만 반환한다 */
  async getOwnedJob(ownerId: string, jobId: string): Promise<Job> {
    const job = await this.jobs.findById(jobId);

    if (!job || job.requestedBy !== ownerId) {
      throw new JobApplicationError('JOB_NOT_FOUND');
    }

    return job;
  }
}
