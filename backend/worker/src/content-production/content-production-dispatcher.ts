/** 콘텐츠 제작 worker dispatcher의 외부 계약을 정의한다 */
import type {
  ContentProductionItem,
  ContentProductionJob,
  ContentProductionJobStatus,
} from '@flex-thia/domain';

/** worker가 요구하는 조건부 콘텐츠 제작 저장소 */
export interface ContentProductionWorkerRepository {
  startAttempt(
    jobId: string,
    attempt: number,
  ): Promise<Pick<
    ContentProductionJob,
    'id' | 'attempt' | 'status' | 'purpose' | 'inputs'
  > | null>;
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
  finishItem(
    jobId: string,
    itemId: string,
    attempt: number,
    leaseUntil: Date,
    outcome: ContentProductionItemOutcome,
  ): Promise<boolean>;
  finalizeAttempt(
    jobId: string,
    attempt: number,
  ): Promise<{ jobId: string; status: ContentProductionJobStatus } | null>;
}

/** deterministic item processor가 반환하는 공개하지 않을 내부 결과 */
export interface ContentProductionItemOutcome {
  status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
  retryable: boolean;
  errorCode: string | null;
  result?: Record<string, unknown>;
}

/** 입력 항목을 local fake 또는 실제 provider로 처리하는 port */
export interface ContentProductionItemProcessor {
  process(item: ContentProductionItem): Promise<ContentProductionItemOutcome>;
}

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

/** stale·terminal 전달을 무시하고 항목 실패를 격리해 한 attempt를 집계한다 */
export const createContentProductionDispatcher =
  (
    repository: ContentProductionWorkerRepository,
    processor: ContentProductionItemProcessor,
  ) =>
  async (input: {
    jobId: string;
    attempt: number;
  }): Promise<{
    jobId: string;
    status: ContentProductionJobStatus | 'IGNORED';
  }> => {
    const job = await repository.startAttempt(input.jobId, input.attempt);

    if (!job) {
      return { jobId: input.jobId, status: 'IGNORED' };
    }

    await repository.ensureItems(job.id, buildSourceRefs(job));
    const items = await repository.listAttemptItems(job.id, input.attempt);

    for (const item of items) {
      const claimed = await repository.startItem(
        job.id,
        item.id,
        input.attempt,
      );

      if (!claimed) {
        continue;
      }

      if (!claimed.leaseUntil) {
        throw new Error(`lease 없는 PROCESSING 항목입니다: ${claimed.id}`);
      }

      let outcome: ContentProductionItemOutcome;

      try {
        outcome = await processor.process(claimed);
      } catch {
        outcome = {
          status: 'FAILED',
          retryable: true,
          errorCode: 'LOCAL_PROCESSOR_FAILURE',
        };
      }

      await repository.finishItem(
        job.id,
        claimed.id,
        input.attempt,
        claimed.leaseUntil,
        outcome,
      );
    }

    return (
      (await repository.finalizeAttempt(job.id, input.attempt)) ?? {
        jobId: job.id,
        status: 'IGNORED',
      }
    );
  };
