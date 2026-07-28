/** TTS 운영 조회와 optimistic 재시도를 HTTP 공개 형태로 조립한다 */
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  TtsDomainError,
  type AuditedRetryTtsItemsInput,
  type MediaReadUrlProvider,
  type TtsItemPage,
  type TtsJob,
  type TtsJobDetail,
  type TtsJobPage,
  type TtsPublicationReadinessProjection,
} from '@flex-thia/domain';
import {
  ttsItemAudioResponseSchema,
  ttsJobDetailResponseSchema,
  ttsJobListResponseSchema,
  ttsRetryResponseSchema,
  ttsPublicationReadinessResponseSchema,
  type RetryTtsItemRequest,
  type RetryTtsItemSelection,
  type TtsJobDetailResponse,
  type TtsJobItemsQuery,
  type TtsJobListQuery,
  type TtsJobListResponse,
  type TtsItemAudioResponse,
  type TtsPublicationReadinessResponse,
  type TtsRetryResponse,
} from '@flex-thia/contracts';

/** TTS 운영 query가 제공하는 기능 branch-local 읽기 경계 */
export interface TtsOperationsQueryPort {
  listJobs(input: {
    status?: TtsJob['status'];
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }): Promise<TtsJobPage>;
  findJob(jobId: string): Promise<TtsJobDetail | null>;
  listItems(input: {
    jobId: string;
    status?: TtsItemPage['items'][number]['status'];
    errorCode?: string;
    page: number;
    pageSize: number;
  }): Promise<TtsItemPage>;
  findAudioItem(itemId: string): Promise<{
    itemId: string;
    itemStatus: TtsItemPage['items'][number]['status'];
    mediaStatus: 'UPLOADING' | 'READY' | 'REJECTED' | null;
    storageKey: string | null;
  } | null>;
  getPublicationReadiness(input: {
    questionId: string;
    versionId: string;
  }): Promise<TtsPublicationReadinessProjection | null>;
}

/** 상태 전이와 durable worker 재전송을 하나의 신뢰 가능한 command로 묶는다 */
export interface TtsRetryCoordinator {
  retryAndDispatch(input: AuditedRetryTtsItemsInput): Promise<number>;
}

/** 인증된 관리자와 request ID를 재시도 audit에 전달한다 */
export interface TtsAdminActorContext {
  userId: string;
  sub: string;
  requestId: string;
}

/** TTS 운영 HTTP 서비스 조립 의존성 */
export interface TtsOperationsServiceDependencies {
  query: TtsOperationsQueryPort;
  retryCoordinator: TtsRetryCoordinator;
  now?: () => Date;
  mediaReadUrls?: MediaReadUrlProvider;
}

const toJobSummary = (job: TtsJob) => ({
  id: job.id,
  status: job.status,
  requestedBy: job.requestedBy,
  counts: {
    pending: job.counts.pending,
    processing: job.counts.processing,
    succeeded: job.counts.succeeded,
    failed: job.counts.failed,
  },
  createdAt: job.createdAt.toISOString(),
  startedAt: job.startedAt?.toISOString() ?? null,
  finishedAt: job.finishedAt?.toISOString() ?? null,
});

const toItemResponse = (item: TtsItemPage['items'][number]) => ({
  id: item.id,
  target: {
    kind: item.target.kind,
    targetId: item.target.targetId,
    text: item.target.text,
    required: item.target.required,
    revision: item.target.revision,
  },
  status: item.status,
  attempt: item.attempt,
  errorCode: item.errorCode,
  retryable: item.retryable,
  mediaAssetId: item.mediaAssetId,
});

const withRetryHttpErrors = async <Output>(
  operation: () => Promise<Output>,
): Promise<Output> => {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof TtsDomainError)) throw error;
    if (error.code === 'TTS_ITEM_NOT_FOUND') {
      throw new NotFoundException({ code: error.code });
    }
    throw new ConflictException({ code: error.code });
  }
};

/** TTS 운영 조회와 재시도 command를 공개 계약으로 제한한다 */
export class TtsOperationsService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: TtsOperationsServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  /** 상태·기간 조건의 최신 TTS 작업 page를 반환한다 */
  async listJobs(input: TtsJobListQuery): Promise<TtsJobListResponse> {
    const page = await this.dependencies.query.listJobs({
      page: input.page,
      pageSize: input.pageSize,
      ...(input.status ? { status: input.status } : {}),
      ...(input.from ? { from: new Date(input.from) } : {}),
      ...(input.to ? { to: new Date(input.to) } : {}),
    });
    return ttsJobListResponseSchema.parse({
      items: page.items.map(toJobSummary),
      page: page.page,
    });
  }

  /** 작업 voice와 필터된 항목을 민감 정보 없이 반환한다 */
  async getJob(
    jobId: string,
    input: TtsJobItemsQuery,
  ): Promise<TtsJobDetailResponse> {
    const job = await this.dependencies.query.findJob(jobId);
    if (!job) {
      throw new NotFoundException({ code: 'TTS_JOB_NOT_FOUND' });
    }
    const items = await this.dependencies.query.listItems({
      jobId,
      page: input.page,
      pageSize: input.pageSize,
      ...(input.status ? { status: input.status } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    });
    return ttsJobDetailResponseSchema.parse({
      ...toJobSummary(job),
      voice: {
        presetId: job.voice.presetId,
        provider: job.voice.provider,
        model: job.voice.model,
        voice: job.voice.voice,
        locale: job.voice.locale,
        audioFormat: job.voice.audioFormat,
        generationRevision: job.voice.generationRevision,
      },
      items: items.items.map(toItemResponse),
      itemPage: items.page,
    });
  }

  /** 성공 항목의 READY media에 클릭 시점 5분 read URL을 발급한다 */
  async getItemAudio(itemId: string): Promise<TtsItemAudioResponse> {
    const item = await this.dependencies.query.findAudioItem(itemId);
    if (!item) {
      throw new NotFoundException({ code: 'TTS_ITEM_NOT_FOUND' });
    }
    if (
      item.itemStatus !== 'SUCCEEDED' ||
      item.mediaStatus !== 'READY' ||
      item.storageKey === null
    ) {
      throw new ConflictException({ code: 'TTS_AUDIO_NOT_READY' });
    }
    if (!this.dependencies.mediaReadUrls) {
      throw new InternalServerErrorException({
        code: 'TTS_MEDIA_READ_URL_PROVIDER_REQUIRED',
      });
    }
    const expiresAt = new Date(this.now().getTime() + 5 * 60 * 1_000);
    const url = await this.dependencies.mediaReadUrls.createReadUrl(
      item.storageKey,
      expiresAt,
    );
    return ttsItemAudioResponseSchema.parse({
      url,
      expiresAt: expiresAt.toISOString(),
    });
  }

  /** 문제/version ownership에 맞는 공개 TTS 게시 readiness를 반환한다 */
  async getPublicationReadiness(
    questionId: string,
    versionId: string,
  ): Promise<TtsPublicationReadinessResponse> {
    const readiness =
      await this.dependencies.query.getPublicationReadiness({
        questionId,
        versionId,
      });
    if (!readiness) {
      throw new NotFoundException({
        code: 'TTS_PUBLICATION_TARGET_MISMATCH',
      });
    }
    return ttsPublicationReadinessResponseSchema.parse(readiness);
  }

  /** 선택한 실패 항목을 optimistic attempt 확인 뒤 일괄 재접수한다 */
  retryJob(
    actor: TtsAdminActorContext,
    jobId: string,
    items: RetryTtsItemSelection[],
  ): Promise<TtsRetryResponse> {
    return this.retry(actor, jobId, items);
  }

  /** 실패 항목 하나를 동일한 optimistic command로 재접수한다 */
  retryItem(
    actor: TtsAdminActorContext,
    itemId: string,
    input: RetryTtsItemRequest,
  ): Promise<TtsRetryResponse> {
    return this.retry(actor, input.jobId, [
      { itemId, expectedAttempt: input.expectedAttempt },
    ]);
  }

  private async retry(
    actor: TtsAdminActorContext,
    jobId: string,
    items: RetryTtsItemSelection[],
  ): Promise<TtsRetryResponse> {
    const itemIds = items.map(({ itemId }) => itemId);
    const expectedAttempts = Object.fromEntries(
      items.map(({ itemId, expectedAttempt }) => [itemId, expectedAttempt]),
    );
    const retriedCount = await withRetryHttpErrors(() =>
      this.dependencies.retryCoordinator.retryAndDispatch({
        jobId,
        itemIds,
        expectedAttempts,
        requestedAt: this.now(),
        context: {
          actorSub: actor.sub,
          actorUserId: actor.userId,
          requestId: actor.requestId,
        },
      }),
    );
    return ttsRetryResponseSchema.parse({
      jobId,
      itemIds,
      retriedCount,
    });
  }
}
