/** 검증된 upload·preset을 콘텐츠 제작 도메인 명령으로 조립한다 */
import { Injectable } from '@nestjs/common';
import type { CreateContentProductionJobRequest } from '@flex-thia/contracts';
import type {
  ContentProductionJob,
  ContentProductionPresetCatalog,
  ContentProductionPresetSnapshot,
  ContentProductionService,
  UploadPolicyService,
  UploadRecord,
  UploadRepository,
} from '@flex-thia/domain';

const MAX_JOB_INPUT_BYTES = 250 * 1024 * 1024;

/** HTTP application 경계에서 공개 가능한 안정적인 오류 */
export class ContentProductionApplicationError extends Error {
  constructor(
    readonly code:
      | 'UPLOAD_NOT_VERIFIED'
      | 'JOB_INPUT_TOO_LARGE'
      | 'PRESET_NOT_AVAILABLE'
      | 'UPLOAD_SERVICE_NOT_CONFIGURED',
  ) {
    super(code);
    this.name = 'ContentProductionApplicationError';
  }
}

/** upload 검증과 콘텐츠 제작 도메인 use case를 연결한다 */
@Injectable()
export class ContentProductionApplicationService {
  constructor(
    private readonly uploads: UploadRepository,
    private readonly presets: ContentProductionPresetCatalog,
    private readonly contentProduction: ContentProductionService,
    private readonly uploadPolicies?: UploadPolicyService,
  ) {}

  /** 검증된 동일 형식 입력과 활성 preset snapshot으로 작업을 생성한다 */
  async create(
    requestedBy: string,
    request: CreateContentProductionJobRequest,
  ): Promise<ContentProductionJob> {
    const uploadIds = [...new Set(request.uploadIds)];
    const verified = await this.uploads.findVerifiedOwnedByIds(
      requestedBy,
      uploadIds,
    );
    const byId = new Map(verified.map((upload) => [upload.uploadId, upload]));
    const inputs = uploadIds.flatMap((uploadId) => {
      const upload = byId.get(uploadId);
      return upload ? [upload] : [];
    });

    if (inputs.length !== uploadIds.length) {
      throw new ContentProductionApplicationError('UPLOAD_NOT_VERIFIED');
    }

    if (
      inputs.reduce((sum, input) => sum + input.sizeBytes, 0) >
      MAX_JOB_INPUT_BYTES
    ) {
      throw new ContentProductionApplicationError('JOB_INPUT_TOO_LARGE');
    }

    const preset = await this.presets.findEnabledById(request.presetId);

    if (!preset || preset.purpose !== request.purpose) {
      throw new ContentProductionApplicationError('PRESET_NOT_AVAILABLE');
    }

    return this.contentProduction.create({
      requestedBy,
      clientRequestId: request.clientRequestId,
      purpose: request.purpose,
      presetSnapshot: preset,
      inputs,
    });
  }

  /** 활성 콘텐츠 제작 preset 목록을 반환한다 */
  listPresets(): Promise<ContentProductionPresetSnapshot[]> {
    return this.presets.listEnabled();
  }

  /** 관리자에게 자신이 만든 작업 목록만 반환한다 */
  listJobs(ownerId: string, limit: number): Promise<ContentProductionJob[]> {
    return this.contentProduction.listOwned(ownerId, limit);
  }

  /** 관리자에게 자신이 만든 작업 상세만 반환한다 */
  getJob(ownerId: string, jobId: string): Promise<ContentProductionJob> {
    return this.contentProduction.getOwned(ownerId, jobId);
  }

  /** retryable 실패 항목이 있는 작업을 다음 attempt로 전송한다 */
  retryJob(ownerId: string, jobId: string): Promise<ContentProductionJob> {
    return this.contentProduction.retry(ownerId, jobId);
  }

  /** content-production 소유 경로에서 private upload policy를 준비한다 */
  createUploadPolicy(
    ownerId: string,
    input: {
      inputType: 'TEXT' | 'PDF' | 'IMAGE';
      contentType: string;
      declaredSizeBytes: number;
    },
  ) {
    return this.requireUploadPolicies().createPolicy({ ownerId, ...input });
  }

  /** 실제 object를 검사해 공개 가능한 VERIFIED 입력 정보만 반환한다 */
  async completeUpload(
    ownerId: string,
    uploadId: string,
  ): Promise<UploadRecord> {
    return this.requireUploadPolicies().complete(ownerId, uploadId);
  }

  private requireUploadPolicies(): UploadPolicyService {
    if (!this.uploadPolicies) {
      throw new ContentProductionApplicationError(
        'UPLOAD_SERVICE_NOT_CONFIGURED',
      );
    }

    return this.uploadPolicies;
  }
}
