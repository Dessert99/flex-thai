/** 로컬 콘텐츠 제작 queue 실행 경계를 제공한다 */
import type {
  ContentProductionItem,
  ContentProductionJob,
  ContentProductionQueue,
  ContentProductionRepository,
} from '@flex-thia/domain';
import type { DeterministicContentProductionProcessor } from './deterministic-content-production.processor.js';

const buildSourceRefs = (
  job: Pick<ContentProductionJob, 'purpose' | 'inputs'>,
): string[] =>
  job.inputs.flatMap((_input, index) => {
    if (job.purpose === 'VOCABULARY_EXTRACTION') {
      return [`input:${index}:vocabulary`];
    }

    if (job.purpose === 'QUESTION_GENERATION') {
      return [`input:${index}:question`];
    }

    return [`input:${index}:vocabulary`, `input:${index}:question`];
  });

/** 로컬 event loop에서 실제 repository 상태 전이를 끝내는 개발 전용 queue */
export class LocalContentProductionQueue implements ContentProductionQueue {
  readonly messages: Array<{ jobId: string; attempt: number }> = [];
  readonly errors: Error[] = [];
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly repository: ContentProductionRepository,
    private readonly processor: DeterministicContentProductionProcessor,
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

    await this.repository.ensureItems(job.id, buildSourceRefs(job));
    const items = await this.repository.listAttemptItems(
      job.id,
      message.attempt,
    );

    for (const item of items) {
      await this.processItem(job.id, message.attempt, item);
    }

    await this.repository.finalizeAttempt(job.id, message.attempt);
  }

  private async processItem(
    jobId: string,
    attempt: number,
    item: ContentProductionItem,
  ): Promise<void> {
    const claimed = await this.repository.startItem(jobId, item.id, attempt);

    if (!claimed?.leaseToken) {
      return;
    }

    let outcome: Awaited<
      ReturnType<DeterministicContentProductionProcessor['process']>
    >;

    try {
      outcome = await this.processor.process(
        claimed,
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
      jobId,
      claimed.id,
      attempt,
      claimed.leaseToken,
      outcome,
    );
  }
}
