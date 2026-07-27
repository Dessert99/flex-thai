/** 로컬 콘텐츠 제작 queue 실행 경계를 제공한다 */
import type {
  ContentProductionItemSeed,
  ContentProductionJob,
  ContentProductionQueue,
  ContentProductionRepository,
  ContentProductionWorkItem,
  ContentProductionWorkerJob,
} from '@flex-thia/domain';
import { createContentProductionWorkItem } from '@flex-thia/domain';

interface LocalContentProductionProcessor {
  process(
    workItem: ContentProductionWorkItem,
    signal: AbortSignal,
  ): Promise<{
    status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
    retryable: boolean;
    errorCode: string | null;
    result?: Record<string, unknown>;
  }>;
}

const buildItemSeeds = (
  job: Pick<ContentProductionWorkerJob, 'purpose' | 'inputs'>,
): ContentProductionItemSeed[] =>
  job.inputs.flatMap((input) => {
    const index = input.ordinal;
    if (job.purpose === 'VOCABULARY_EXTRACTION') {
      return [
        {
          sourceRef: `input:${index}:vocabulary`,
          jobInputId: input.jobInputId,
          operation: 'VOCABULARY_EXTRACTION',
        },
      ];
    }

    if (job.purpose === 'QUESTION_GENERATION') {
      return [
        {
          sourceRef: `input:${index}:question`,
          jobInputId: input.jobInputId,
          operation: 'QUESTION_GENERATION',
        },
      ];
    }

    return [
      {
        sourceRef: `input:${index}:vocabulary`,
        jobInputId: input.jobInputId,
        operation: 'VOCABULARY_EXTRACTION',
      },
      {
        sourceRef: `input:${index}:question`,
        jobInputId: input.jobInputId,
        operation: 'QUESTION_GENERATION',
      },
    ];
  });

const requireWorkerJob = (
  job: ContentProductionJob,
): ContentProductionWorkerJob => ({
  id: job.id,
  attempt: job.attempt,
  requestedBy: job.requestedBy,
  purpose: job.purpose,
  presetSnapshot: job.presetSnapshot,
  inputs: job.inputs.map((input) => {
    if (!input.jobInputId || input.ordinal === undefined) {
      throw new Error('로컬 콘텐츠 제작 입력 metadata가 없습니다');
    }

    return {
      ...input,
      jobInputId: input.jobInputId,
      ordinal: input.ordinal,
    };
  }),
});

/** 로컬 event loop에서 실제 repository 상태 전이를 끝내는 개발 전용 queue */
export class LocalContentProductionQueue implements ContentProductionQueue {
  readonly messages: Array<{ jobId: string; attempt: number }> = [];
  readonly errors: Error[] = [];
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly repository: ContentProductionRepository,
    private readonly processor: LocalContentProductionProcessor,
  ) {}

  /** API 응답 상태 저장 뒤 실행되도록 message 처리를 다음 event loop에 예약한다 */
  send(message: { jobId: string; attempt: number }): Promise<void> {
    this.messages.push({ ...message });
    const task = new Promise<void>((resolve) => {
      setTimeout(() => {
        void this.run(message).then(
          () => resolve(),
          (error: unknown) => {
            this.errors.push(
              error instanceof Error ? error : new Error(String(error)),
            );
            resolve();
          },
        );
      }, 0);
    });
    this.pending.add(task);
    void task.then(() => this.pending.delete(task));
    return Promise.resolve();
  }

  /** 단위 테스트와 local 종료가 예약된 모든 작업을 기다리게 한다 */
  async waitForIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  private async run(message: {
    jobId: string;
    attempt: number;
  }): Promise<void> {
    const job = await this.repository.startAttempt(
      message.jobId,
      message.attempt,
    );

    if (!job) {
      return;
    }

    const workerJob = requireWorkerJob(job);
    await this.repository.ensureItems(job.id, buildItemSeeds(workerJob));
    const items = await this.repository.listAttemptItems(
      job.id,
      message.attempt,
    );

    for (const item of items) {
      await this.processItem(workerJob, message.attempt, item.id);
    }

    await this.repository.finalizeAttempt(job.id, message.attempt);
  }

  private async processItem(
    job: ContentProductionWorkerJob,
    attempt: number,
    itemId: string,
  ): Promise<void> {
    const claimed = await this.repository.startItem(job.id, itemId, attempt);

    if (
      !claimed?.leaseToken ||
      !claimed.leaseUntil ||
      !claimed.jobInputId ||
      !claimed.operation
    ) {
      return;
    }

    let outcome: Awaited<
      ReturnType<LocalContentProductionProcessor['process']>
    >;

    try {
      outcome = await this.processor.process(
        createContentProductionWorkItem(job, {
          ...claimed,
          jobInputId: claimed.jobInputId,
          operation: claimed.operation,
          leaseUntil: claimed.leaseUntil,
          leaseToken: claimed.leaseToken,
        }),
        new AbortController().signal,
      );
    } catch {
      outcome = {
        status: 'FAILED',
        retryable: true,
        errorCode: 'LOCAL_PROCESSOR_FAILURE',
      };
    }

    await this.repository.finishItem(
      job.id,
      claimed.id,
      attempt,
      claimed.leaseToken,
      outcome,
    );
  }
}
