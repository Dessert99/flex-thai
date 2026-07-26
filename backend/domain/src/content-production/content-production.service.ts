/** 콘텐츠 제작 작업 생성·조회·재시도를 조율하는 도메인 경계 */

/** 콘텐츠 제작 작업 목적 */
export type ContentProductionPurpose =
  | 'VOCABULARY_EXTRACTION'
  | 'QUESTION_GENERATION'
  | 'VOCABULARY_THEN_QUESTION_GENERATION';

/** 콘텐츠 제작 입력 형식 */
export type ContentProductionInputType = 'TEXT' | 'PDF' | 'IMAGE';

/** 콘텐츠 제작 작업 상태 */
export type ContentProductionJobStatus =
  'QUEUED' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_FAILURES' | 'FAILED';

/** 콘텐츠 제작 항목 상태 */
export type ContentProductionItemStatus =
  'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';

/** worker kill 뒤 항목을 회수하되 정상 실행 중에는 중복 claim하지 않는 lease */
export const CONTENT_PRODUCTION_ITEM_LEASE_MS = 5 * 60 * 1000;

/** 작업에 고정되는 preset snapshot */
export interface ContentProductionPresetSnapshot {
  id: string;
  name: string;
  purpose: ContentProductionPurpose;
  version: number;
  parameters: Record<string, unknown>;
}

/** 콘텐츠 제작 입력 snapshot */
export interface ContentProductionInput {
  uploadId: string;
  inputType: ContentProductionInputType;
  inputKey: string;
  sizeBytes: number;
}

/** 콘텐츠 제작 항목 snapshot */
export interface ContentProductionItem {
  id: string;
  sourceRef: string;
  status: ContentProductionItemStatus;
  attempt: number;
  retryable: boolean;
  errorCode: string | null;
  leaseUntil: Date | null;
  leaseToken: string | null;
}

/** 콘텐츠 제작 작업 aggregate */
export interface ContentProductionJob {
  id: string;
  requestedBy: string;
  clientRequestId: string;
  purpose: ContentProductionPurpose;
  presetSnapshot: ContentProductionPresetSnapshot;
  inputs: ContentProductionInput[];
  status: ContentProductionJobStatus;
  attempt: number;
  enqueuedAt: Date | null;
  completedAt: Date | null;
  counts: {
    total: number;
    succeeded: number;
    needsAttention: number;
    failed: number;
  };
  items: ContentProductionItem[];
  createdAt: Date;
}

/** 콘텐츠 제작 작업 생성 명령 */
export type CreateContentProductionCommand = Omit<
  ContentProductionJob,
  | 'id'
  | 'status'
  | 'attempt'
  | 'enqueuedAt'
  | 'completedAt'
  | 'counts'
  | 'items'
  | 'createdAt'
>;

/** 콘텐츠 제작 저장소 port */
export interface ContentProductionRepository {
  createOrFind(
    command: CreateContentProductionCommand,
  ): Promise<{ job: ContentProductionJob; created: boolean }>;
  markEnqueued(
    jobId: string,
    attempt: number,
    enqueuedAt: Date,
  ): Promise<ContentProductionJob>;
  findOwnedById(
    ownerId: string,
    jobId: string,
  ): Promise<ContentProductionJob | null>;
  listOwned(ownerId: string, limit: number): Promise<ContentProductionJob[]>;
  startAttempt(
    jobId: string,
    attempt: number,
  ): Promise<ContentProductionJob | null>;
  ensureItems(jobId: string, sourceRefs: string[]): Promise<void>;
  listAttemptItems(
    jobId: string,
    attempt: number,
  ): Promise<ContentProductionItem[]>;
  startItem(
    jobId: string,
    itemId: string,
    attempt: number,
  ): Promise<ContentProductionItem | null>;
  renewItemLease(
    jobId: string,
    itemId: string,
    attempt: number,
    leaseToken: string,
  ): Promise<boolean>;
  finishItem(
    jobId: string,
    itemId: string,
    attempt: number,
    leaseToken: string,
    outcome: {
      status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
      retryable: boolean;
      errorCode: string | null;
      result?: Record<string, unknown>;
    },
  ): Promise<boolean>;
  finalizeAttempt(
    jobId: string,
    attempt: number,
  ): Promise<{ jobId: string; status: ContentProductionJobStatus } | null>;
  retryFailed(
    jobId: string,
    ownerId: string,
    maxAttempts: number,
  ): Promise<ContentProductionJob | null>;
}

/** 작업 생성 시 사용할 활성 preset 조회 port */
export interface ContentProductionPresetCatalog {
  listEnabled(): Promise<ContentProductionPresetSnapshot[]>;
  findEnabledById(
    presetId: string,
  ): Promise<ContentProductionPresetSnapshot | null>;
}

/** 콘텐츠 제작 queue port */
export interface ContentProductionQueue {
  send(message: { jobId: string; attempt: number }): Promise<void>;
}

/** 콘텐츠 제작 불변 조건의 안정적인 오류 */
export class ContentProductionDomainError extends Error {
  constructor(
    readonly code:
      | 'MIXED_INPUT_TYPES'
      | 'PRESET_PURPOSE_MISMATCH'
      | 'CONTENT_PRODUCTION_IDEMPOTENCY_CONFLICT'
      | 'JOB_NOT_FOUND'
      | 'JOB_NOT_RETRYABLE'
      | 'JOB_RETRY_LIMIT_EXCEEDED',
  ) {
    super(code);
    this.name = 'ContentProductionDomainError';
  }
}

const MAX_RETRY_ATTEMPT = 3;

const sortRecord = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortRecord);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortRecord(entry)]),
    );
  }

  return value;
};

const canonicalRequest = (command: CreateContentProductionCommand): string =>
  JSON.stringify(
    sortRecord({
      purpose: command.purpose,
      presetSnapshot: command.presetSnapshot,
      inputs: [...command.inputs].sort((left, right) =>
        left.uploadId.localeCompare(right.uploadId),
      ),
    }),
  );

const canonicalJob = (job: ContentProductionJob): string =>
  canonicalRequest({
    requestedBy: job.requestedBy,
    clientRequestId: job.clientRequestId,
    purpose: job.purpose,
    presetSnapshot: job.presetSnapshot,
    inputs: job.inputs,
  });

/** 작업 생성·조회·재시도를 제공하는 콘텐츠 제작 use case */
export class ContentProductionService {
  constructor(
    private readonly repository: ContentProductionRepository,
    private readonly queue: ContentProductionQueue,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 같은 형식의 검증된 입력과 고정 preset으로 멱등 작업을 생성한다 */
  async create(
    command: CreateContentProductionCommand,
  ): Promise<ContentProductionJob> {
    if (
      command.inputs.some(
        (input) => input.inputType !== command.inputs[0]?.inputType,
      )
    ) {
      throw new ContentProductionDomainError('MIXED_INPUT_TYPES');
    }

    if (command.presetSnapshot.purpose !== command.purpose) {
      throw new ContentProductionDomainError('PRESET_PURPOSE_MISMATCH');
    }

    const { job, created } = await this.repository.createOrFind(command);

    if (!created && canonicalJob(job) !== canonicalRequest(command)) {
      throw new ContentProductionDomainError(
        'CONTENT_PRODUCTION_IDEMPOTENCY_CONFLICT',
      );
    }

    if (job.enqueuedAt) {
      return job;
    }

    await this.queue.send({ jobId: job.id, attempt: job.attempt });
    return this.repository.markEnqueued(job.id, job.attempt, this.now());
  }

  /** retryable 실패 항목이 있는 terminal 작업만 최대 3회 다시 queue에 넣는다 */
  async retry(ownerId: string, jobId: string): Promise<ContentProductionJob> {
    const current = await this.repository.findOwnedById(ownerId, jobId);

    if (!current) {
      throw new ContentProductionDomainError('JOB_NOT_FOUND');
    }

    // 새 attempt 전송 실패는 attempt를 늘리지 않고 같은 queue message만 복구
    if (
      current.attempt > 0 &&
      current.status === 'QUEUED' &&
      !current.enqueuedAt
    ) {
      await this.queue.send({
        jobId: current.id,
        attempt: current.attempt,
      });
      return this.repository.markEnqueued(
        current.id,
        current.attempt,
        this.now(),
      );
    }

    if (current.attempt >= MAX_RETRY_ATTEMPT) {
      throw new ContentProductionDomainError('JOB_RETRY_LIMIT_EXCEEDED');
    }

    if (
      !['COMPLETED_WITH_FAILURES', 'FAILED'].includes(current.status) ||
      !current.items.some((item) => item.status === 'FAILED' && item.retryable)
    ) {
      throw new ContentProductionDomainError('JOB_NOT_RETRYABLE');
    }

    const retried = await this.repository.retryFailed(
      jobId,
      ownerId,
      MAX_RETRY_ATTEMPT,
    );

    if (!retried) {
      throw new ContentProductionDomainError('JOB_NOT_RETRYABLE');
    }

    await this.queue.send({ jobId: retried.id, attempt: retried.attempt });
    return this.repository.markEnqueued(
      retried.id,
      retried.attempt,
      this.now(),
    );
  }

  /** 관리자에게 소유한 작업 상세만 반환한다 */
  async getOwned(
    ownerId: string,
    jobId: string,
  ): Promise<ContentProductionJob> {
    const job = await this.repository.findOwnedById(ownerId, jobId);

    if (!job) {
      throw new ContentProductionDomainError('JOB_NOT_FOUND');
    }

    return job;
  }

  /** 관리자에게 자신이 생성한 최근 작업만 반환한다 */
  listOwned(ownerId: string, limit: number): Promise<ContentProductionJob[]> {
    return this.repository.listOwned(ownerId, limit);
  }
}
