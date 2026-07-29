/** 검증된 upload·preset을 콘텐츠 제작 도메인 명령으로 조립한다 */
import { Injectable } from '@nestjs/common';
import {
  createContentProductionPresetRequestSchema,
  createContentProductionPresetVersionRequestSchema,
  type ContentProductionJobConfiguration,
  type CreateContentProductionJobRequest,
  type CreateContentProductionPresetRequest,
  type CreateContentProductionPresetVersionRequest,
  type PromptPreviewRequest,
  type SetContentProductionPresetEnabledRequest,
} from '@flex-thia/contracts';
import {
  buildQuestionGenerationPrompt,
  expandQuestionGenerationPlan,
  serializeQuestionGenerationPrompt,
} from '@flex-thia/domain';
import type {
  ContentProductionJob,
  ContentProductionPresetCatalog,
  ContentProductionPresetSnapshot,
  ContentProductionService,
  QuestionGenerationParameters,
  QuestionProductionContextRepository,
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
      | 'UPLOAD_SERVICE_NOT_CONFIGURED'
      | 'QUESTION_CONTEXT_NOT_CONFIGURED'
      | 'QUESTION_PLAN_INDEX_INVALID',
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
    private readonly questionProductionContext?: QuestionProductionContextRepository,
  ) {}

  private async resolveSnapshot(
    configuration: ContentProductionJobConfiguration,
  ): Promise<ContentProductionPresetSnapshot> {
    const preset = await this.presets.resolveEffectiveSnapshot({
      purpose: configuration.purpose,
      presetId: configuration.presetId,
      options: configuration.options,
    });
    if (!preset || preset.purpose !== configuration.purpose) {
      throw new ContentProductionApplicationError('PRESET_NOT_AVAILABLE');
    }
    return preset;
  }

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

    const preset = await this.resolveSnapshot(request);

    return this.contentProduction.create({
      requestedBy,
      clientRequestId: request.clientRequestId,
      purpose: request.purpose,
      presetSnapshot: preset,
      inputs,
    });
  }

  /** worker와 같은 effective snapshot·item plan으로 provider 호출 없는 prompt를 만든다 */
  async preview(request: PromptPreviewRequest) {
    if (!this.questionProductionContext) {
      throw new ContentProductionApplicationError(
        'QUESTION_CONTEXT_NOT_CONFIGURED',
      );
    }
    const preset = await this.resolveSnapshot(request);
    const questionPlan = expandQuestionGenerationPlan(
      preset.parameters as unknown as QuestionGenerationParameters,
    )[request.questionPlanIndex];
    if (!questionPlan) {
      throw new ContentProductionApplicationError(
        'QUESTION_PLAN_INDEX_INVALID',
      );
    }
    const prompt = buildQuestionGenerationPrompt(
      await this.questionProductionContext.load({
        preset,
        operation: 'QUESTION_GENERATION',
        questionPlan,
      }),
    );
    return {
      promptVersion: prompt.promptVersion,
      questionPlanIndex: request.questionPlanIndex,
      sections: prompt.sections,
      prompt: serializeQuestionGenerationPrompt(prompt),
    };
  }

  /** 활성 콘텐츠 제작 preset 목록을 반환한다 */
  listPresets(): Promise<ContentProductionPresetSnapshot[]> {
    return this.presets.listEnabled();
  }

  /** immutable preset version 운영 목록을 반환한다 */
  listPresetVersions() {
    return this.presets.listVersions();
  }

  /** 새 이름의 최초 preset version을 생성한다 */
  createPreset(
    actor: { userId: string; sub: string },
    request: CreateContentProductionPresetRequest,
  ) {
    const parsed = createContentProductionPresetRequestSchema.parse(request);
    return this.presets.createInitial({
      ...parsed,
      actorUserId: actor.userId,
      actorSub: actor.sub,
      occurredAt: new Date(),
    });
  }

  /** 기존 preset 이름의 다음 immutable version을 생성한다 */
  createPresetVersion(
    actor: { userId: string; sub: string },
    presetId: string,
    request: CreateContentProductionPresetVersionRequest,
  ) {
    const parsed =
      createContentProductionPresetVersionRequestSchema.parse(request);
    return this.presets.createNextVersion({
      ...parsed,
      presetId,
      actorUserId: actor.userId,
      actorSub: actor.sub,
      occurredAt: new Date(),
    });
  }

  /** preset enabled 상태를 현재 revision 기준으로 변경한다 */
  setPresetEnabled(
    actor: { userId: string; sub: string },
    presetId: string,
    request: SetContentProductionPresetEnabledRequest,
  ) {
    return this.presets.setEnabled({
      ...request,
      presetId,
      actorUserId: actor.userId,
      actorSub: actor.sub,
      occurredAt: new Date(),
    });
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
