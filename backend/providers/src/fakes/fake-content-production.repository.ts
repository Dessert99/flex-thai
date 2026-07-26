/** DB 없이 콘텐츠 제작 작업·항목의 조건부 상태 전이를 재현한다 */
import { randomUUID } from 'node:crypto';
import { CONTENT_PRODUCTION_ITEM_LEASE_MS } from '@flex-thia/domain';
import type {
  ContentProductionItem,
  ContentProductionJob,
  ContentProductionJobStatus,
  ContentProductionRepository,
  CreateContentProductionCommand,
} from '@flex-thia/domain';

const cloneJob = (job: ContentProductionJob): ContentProductionJob => ({
  ...job,
  presetSnapshot: {
    ...job.presetSnapshot,
    parameters: { ...job.presetSnapshot.parameters },
  },
  inputs: job.inputs.map((input) => ({ ...input })),
  counts: { ...job.counts },
  items: job.items.map((item) => ({
    ...item,
    leaseUntil: item.leaseUntil ? new Date(item.leaseUntil) : null,
    leaseToken: item.leaseToken,
  })),
});

/** local 개발과 단위 테스트용 콘텐츠 제작 in-memory repository */
export class FakeContentProductionRepository implements ContentProductionRepository {
  private readonly jobs = new Map<string, ContentProductionJob>();
  private readonly requestIndex = new Map<string, string>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** 요청자와 clientRequestId가 같으면 기존 aggregate를 반환한다 */
  createOrFind(
    command: CreateContentProductionCommand,
  ): Promise<{ job: ContentProductionJob; created: boolean }> {
    const requestKey = `${command.requestedBy}:${command.clientRequestId}`;
    const existingId = this.requestIndex.get(requestKey);

    if (existingId) {
      const existing = this.jobs.get(existingId);

      if (!existing) {
        throw new Error('콘텐츠 제작 fake 요청 인덱스가 손상되었습니다');
      }

      return Promise.resolve({ job: cloneJob(existing), created: false });
    }

    const job: ContentProductionJob = {
      id: randomUUID(),
      ...command,
      presetSnapshot: {
        ...command.presetSnapshot,
        parameters: { ...command.presetSnapshot.parameters },
      },
      inputs: command.inputs.map((input) => ({ ...input })),
      status: 'QUEUED',
      attempt: 0,
      enqueuedAt: null,
      completedAt: null,
      failureCode: null,
      counts: { total: 0, succeeded: 0, needsAttention: 0, failed: 0 },
      items: [],
      createdAt: this.now(),
    };
    this.jobs.set(job.id, job);
    this.requestIndex.set(requestKey, job.id);
    return Promise.resolve({ job: cloneJob(job), created: true });
  }

  /** 현재 attempt의 첫 queue 전송만 시각을 기록한다 */
  markEnqueued(
    jobId: string,
    attempt: number,
    enqueuedAt: Date,
  ): Promise<ContentProductionJob> {
    const job = this.requireJob(jobId);

    if (job.attempt === attempt && !job.enqueuedAt) {
      job.enqueuedAt = enqueuedAt;
    }

    return Promise.resolve(cloneJob(job));
  }

  /** 다른 관리자의 작업 존재 여부를 숨긴다 */
  findOwnedById(
    ownerId: string,
    jobId: string,
  ): Promise<ContentProductionJob | null> {
    const job = this.jobs.get(jobId);
    return Promise.resolve(job?.requestedBy === ownerId ? cloneJob(job) : null);
  }

  /** 관리자가 만든 최신 작업을 제한 개수만 반환한다 */
  listOwned(ownerId: string, limit: number): Promise<ContentProductionJob[]> {
    return Promise.resolve(
      [...this.jobs.values()]
        .filter((job) => job.requestedBy === ownerId)
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        )
        .slice(0, limit)
        .map(cloneJob),
    );
  }

  /** 정확한 QUEUED attempt만 RUNNING으로 claim한다 */
  startAttempt(
    jobId: string,
    attempt: number,
  ): Promise<ContentProductionJob | null> {
    const job = this.jobs.get(jobId);

    if (!job || job.attempt !== attempt) {
      return Promise.resolve(null);
    }

    if (job.status === 'RUNNING') {
      return Promise.resolve(cloneJob(job));
    }

    if (job.status !== 'QUEUED') {
      return Promise.resolve(null);
    }

    job.status = 'RUNNING';
    return Promise.resolve(cloneJob(job));
  }

  /** 같은 sourceRef 항목을 중복 전달에도 한 번만 생성한다 */
  ensureItems(jobId: string, sourceRefs: string[]): Promise<void> {
    const job = this.requireJob(jobId);
    const existingRefs = new Set(job.items.map((item) => item.sourceRef));

    for (const sourceRef of sourceRefs) {
      if (existingRefs.has(sourceRef)) {
        continue;
      }

      job.items.push({
        id: randomUUID(),
        sourceRef,
        status: 'PENDING',
        attempt: job.attempt,
        retryable: false,
        errorCode: null,
        leaseUntil: null,
        leaseToken: null,
      });
    }

    job.counts.total = job.items.length;
    return Promise.resolve();
  }

  /** 현재 attempt의 PENDING 또는 lease 만료 PROCESSING 항목만 반환한다 */
  listAttemptItems(
    jobId: string,
    attempt: number,
  ): Promise<ContentProductionItem[]> {
    return Promise.resolve(
      this.requireJob(jobId)
        .items.filter((item) => {
          if (item.attempt !== attempt) {
            return false;
          }

          return (
            item.status === 'PENDING' ||
            (item.status === 'PROCESSING' &&
              (!item.leaseUntil || item.leaseUntil <= this.now()))
          );
        })
        .map((item) => ({ ...item })),
    );
  }

  /** PENDING 또는 lease 만료 PROCESSING 항목만 새 lease로 claim한다 */
  startItem(
    jobId: string,
    itemId: string,
    attempt: number,
  ): Promise<ContentProductionItem | null> {
    const item = this.requireJob(jobId).items.find(
      (candidate) => candidate.id === itemId,
    );

    const claimedAt = this.now();
    const claimable =
      item?.status === 'PENDING' ||
      (item?.status === 'PROCESSING' &&
        (!item.leaseUntil || item.leaseUntil <= claimedAt));

    if (!item || item.attempt !== attempt || !claimable) {
      return Promise.resolve(null);
    }

    item.status = 'PROCESSING';
    item.leaseUntil = new Date(
      claimedAt.getTime() + CONTENT_PRODUCTION_ITEM_LEASE_MS,
    );
    item.leaseToken = randomUUID();
    return Promise.resolve({ ...item });
  }

  /** 활성 token 소유자만 lease를 연장한다 */
  renewItemLease(
    jobId: string,
    itemId: string,
    attempt: number,
    leaseToken: string,
  ): Promise<boolean> {
    const item = this.requireJob(jobId).items.find(
      (candidate) => candidate.id === itemId,
    );
    const renewedAt = this.now();

    if (
      !item ||
      item.attempt !== attempt ||
      item.status !== 'PROCESSING' ||
      item.leaseToken !== leaseToken ||
      !item.leaseUntil ||
      item.leaseUntil <= renewedAt
    ) {
      return Promise.resolve(false);
    }

    item.leaseUntil = new Date(
      renewedAt.getTime() + CONTENT_PRODUCTION_ITEM_LEASE_MS,
    );
    return Promise.resolve(true);
  }

  /** 현재 lease 소유자의 완료 결과만 terminal 상태로 반영한다 */
  finishItem(
    jobId: string,
    itemId: string,
    attempt: number,
    leaseToken: string,
    outcome: {
      status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
      retryable: boolean;
      errorCode: string | null;
    },
  ): Promise<boolean> {
    const item = this.requireJob(jobId).items.find(
      (candidate) => candidate.id === itemId,
    );

    if (
      !item ||
      item.attempt !== attempt ||
      item.status !== 'PROCESSING' ||
      item.leaseToken !== leaseToken
    ) {
      return Promise.resolve(false);
    }

    Object.assign(item, outcome);
    item.leaseUntil = null;
    item.leaseToken = null;
    return Promise.resolve(true);
  }

  /** 모든 현재 항목이 끝났을 때만 부분 실패를 포함한 최종 상태를 계산한다 */
  finalizeAttempt(
    jobId: string,
    attempt: number,
  ): Promise<{ jobId: string; status: ContentProductionJobStatus } | null> {
    const job = this.requireJob(jobId);

    if (job.attempt !== attempt || job.status !== 'RUNNING') {
      return Promise.resolve(null);
    }

    if (
      job.items.some(
        (item) =>
          item.attempt === attempt &&
          (item.status === 'PENDING' || item.status === 'PROCESSING'),
      )
    ) {
      return Promise.resolve(null);
    }

    this.updateCounts(job);
    job.completedAt = this.now();
    job.status = this.finalStatus(job);
    return Promise.resolve({ jobId, status: job.status });
  }

  /** 현재 QUEUED 또는 RUNNING attempt만 workflow 실패로 닫는다 */
  failAttempt(
    jobId: string,
    attempt: number,
    errorCode: string,
  ): Promise<{ jobId: string; status: 'FAILED' } | null> {
    const job = this.jobs.get(jobId);

    if (
      !job ||
      job.attempt !== attempt ||
      !['QUEUED', 'RUNNING'].includes(job.status)
    ) {
      return Promise.resolve(null);
    }

    job.status = 'FAILED';
    job.failureCode = errorCode;
    job.completedAt = this.now();

    for (const item of job.items) {
      if (
        item.attempt === attempt &&
        (item.status === 'PENDING' || item.status === 'PROCESSING')
      ) {
        item.status = 'FAILED';
        item.retryable = true;
        item.errorCode = errorCode;
        item.leaseUntil = null;
        item.leaseToken = null;
      }
    }

    this.updateCounts(job);
    return Promise.resolve({ jobId, status: 'FAILED' });
  }

  /** retryable 실패만 다음 attempt의 PENDING으로 열고 성공 결과는 보존한다 */
  retryFailed(
    jobId: string,
    ownerId: string,
    maxAttempts: number,
  ): Promise<ContentProductionJob | null> {
    const job = this.jobs.get(jobId);

    if (
      !job ||
      job.requestedBy !== ownerId ||
      job.attempt >= maxAttempts ||
      !['FAILED', 'COMPLETED_WITH_FAILURES'].includes(job.status)
    ) {
      return Promise.resolve(null);
    }

    const retryableItems = job.items.filter(
      (item) =>
        item.retryable &&
        (item.status === 'FAILED' ||
          (item.status === 'NEEDS_ATTENTION' &&
            item.errorCode === 'PROVIDER_OUTCOME_UNKNOWN')),
    );

    const hasWorkflowFailure =
      job.status === 'FAILED' &&
      job.failureCode === 'CONTENT_PRODUCTION_WORKFLOW_FAILURE';

    if (retryableItems.length === 0 && !hasWorkflowFailure) {
      return Promise.resolve(null);
    }

    job.attempt += 1;
    job.status = 'QUEUED';
    job.enqueuedAt = null;
    job.completedAt = null;
    job.failureCode = null;

    for (const item of retryableItems) {
      item.status = 'PENDING';
      item.attempt = job.attempt;
      item.retryable = false;
      item.errorCode = null;
      item.leaseUntil = null;
      item.leaseToken = null;
    }

    return Promise.resolve(cloneJob(job));
  }

  private requireJob(jobId: string): ContentProductionJob {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`콘텐츠 제작 작업을 찾을 수 없습니다: ${jobId}`);
    }

    return job;
  }

  private updateCounts(job: ContentProductionJob): void {
    job.counts = {
      total: job.items.length,
      succeeded: job.items.filter((item) => item.status === 'SUCCEEDED').length,
      needsAttention: job.items.filter(
        (item) => item.status === 'NEEDS_ATTENTION',
      ).length,
      failed: job.items.filter((item) => item.status === 'FAILED').length,
    };
  }

  private finalStatus(job: ContentProductionJob): ContentProductionJobStatus {
    if (job.counts.failed === job.counts.total && job.counts.total > 0) {
      return 'FAILED';
    }

    if (job.counts.failed > 0 || job.counts.needsAttention > 0) {
      return 'COMPLETED_WITH_FAILURES';
    }

    return 'COMPLETED';
  }
}
