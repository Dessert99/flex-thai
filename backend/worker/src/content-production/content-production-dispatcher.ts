/** 콘텐츠 제작 worker dispatcher의 외부 계약을 정의한다 */
import type {
  ContentProductionItem,
  ContentProductionJobStatus,
  ContentProductionJob,
  ContentProductionItemSeed,
  ContentProductionWorkerJob,
  ContentProductionWorkItem,
  VocabularyProductionArtifacts,
} from '@flex-thia/domain';
import {
  CONTENT_PRODUCTION_ITEM_LEASE_MS,
  createContentProductionWorkItem,
} from '@flex-thia/domain';

const CONTENT_PRODUCTION_ITEM_HEARTBEAT_MS = Math.floor(
  CONTENT_PRODUCTION_ITEM_LEASE_MS / 3,
);
const CONTENT_PRODUCTION_ITEM_HEARTBEAT_RETRY_MS = 5 * 1000;

type ContentProductionWorkerJobSnapshot = Pick<
  ContentProductionJob,
  | 'id'
  | 'attempt'
  | 'status'
  | 'requestedBy'
  | 'purpose'
  | 'presetSnapshot'
  | 'inputs'
>;

/** worker가 요구하는 조건부 콘텐츠 제작 저장소 */
export interface ContentProductionWorkerRepository {
  startAttempt(
    jobId: string,
    attempt: number,
  ): Promise<ContentProductionWorkerJobSnapshot | null>;
  ensureItems(jobId: string, seeds: ContentProductionItemSeed[]): Promise<void>;
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
  artifacts?: VocabularyProductionArtifacts;
}

/** 입력 항목을 local fake 또는 실제 provider로 처리하는 port */
export interface ContentProductionItemProcessor {
  process(
    workItem: ContentProductionWorkItem,
    signal: AbortSignal,
  ): Promise<ContentProductionItemOutcome>;
}

/** operation별 AI pipeline을 한 dispatcher processor 계약으로 조립한다 */
export const createContentProductionProcessorRouter = (processors: {
  vocabulary: ContentProductionItemProcessor;
  question: ContentProductionItemProcessor;
}): ContentProductionItemProcessor => ({
  process(workItem, signal) {
    return workItem.item.operation === 'QUESTION_GENERATION'
      ? processors.question.process(workItem, signal)
      : processors.vocabulary.process(workItem, signal);
  },
});

const startLeaseHeartbeat = (
  repository: ContentProductionWorkerRepository,
  claimed: ContentProductionItem & {
    leaseUntil: Date;
    leaseToken: string;
  },
  jobId: string,
  attempt: number,
  controller: AbortController,
) => {
  let stopped = false;
  let leaseLost = false;
  let leaseDeadline = claimed.leaseUntil.getTime();
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTask = Promise.resolve();

  const clearTimers = () => {
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }

    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
      deadlineTimer = null;
    }
  };

  const loseLease = () => {
    if (stopped || leaseLost) {
      return;
    }

    leaseLost = true;
    clearTimers();
    controller.abort(
      new Error(`콘텐츠 제작 항목 lease를 잃었습니다: ${claimed.id}`),
    );
  };

  const armDeadline = () => {
    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
    }

    deadlineTimer = setTimeout(
      loseLease,
      Math.max(0, leaseDeadline - Date.now()),
    );
  };

  const scheduleRenewal = (delay: number) => {
    if (stopped || leaseLost) {
      return;
    }

    heartbeatTimer = setTimeout(() => {
      heartbeatTask = (async () => {
        try {
          const renewed = await repository.renewItemLease(
            jobId,
            claimed.id,
            attempt,
            claimed.leaseToken,
          );

          if (stopped || leaseLost) {
            return;
          }

          if (!renewed) {
            loseLease();
            return;
          }

          leaseDeadline = Date.now() + CONTENT_PRODUCTION_ITEM_LEASE_MS;
          armDeadline();
          scheduleRenewal(CONTENT_PRODUCTION_ITEM_HEARTBEAT_MS);
        } catch {
          if (
            !stopped &&
            !leaseLost &&
            Date.now() + CONTENT_PRODUCTION_ITEM_HEARTBEAT_RETRY_MS <
              leaseDeadline
          ) {
            scheduleRenewal(CONTENT_PRODUCTION_ITEM_HEARTBEAT_RETRY_MS);
          }
        }
      })();
    }, delay);
  };

  armDeadline();
  scheduleRenewal(CONTENT_PRODUCTION_ITEM_HEARTBEAT_MS);

  return {
    /** lease 소유권 상실 여부 */
    isLeaseLost: () => leaseLost,
    /** timer를 해제하고 이미 시작된 갱신을 기다린다 */
    stop: async () => {
      stopped = true;
      clearTimers();
      await heartbeatTask;
    },
  };
};

const buildItemSeeds = (
  job: ContentProductionWorkerJobSnapshot,
): ContentProductionItemSeed[] =>
  job.inputs.flatMap((input, index) => {
    if (!input.jobInputId || input.ordinal === undefined) {
      throw new Error(`job input ID가 없는 콘텐츠 제작 작업입니다: ${job.id}`);
    }
    if (job.purpose === 'VOCABULARY_EXTRACTION') {
      return [
        {
          sourceRef: `input:${index}:vocabulary`,
          jobInputId: input.jobInputId,
          operation: 'VOCABULARY_EXTRACTION' as const,
        },
      ];
    }

    if (job.purpose === 'QUESTION_GENERATION') {
      return [
        {
          sourceRef: `input:${index}:question`,
          jobInputId: input.jobInputId,
          operation: 'QUESTION_GENERATION' as const,
        },
      ];
    }

    return [
      {
        sourceRef: `input:${index}:vocabulary`,
        jobInputId: input.jobInputId,
        operation: 'VOCABULARY_EXTRACTION' as const,
      },
      {
        sourceRef: `input:${index}:question`,
        jobInputId: input.jobInputId,
        operation: 'QUESTION_GENERATION' as const,
      },
    ];
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

    const itemSeeds = buildItemSeeds(job);
    await repository.ensureItems(job.id, itemSeeds);
    const seedsBySourceRef = new Map(
      itemSeeds.map((seed) => [seed.sourceRef, seed]),
    );
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

      if (!claimed.leaseToken) {
        throw new Error(
          `lease token 없는 PROCESSING 항목입니다: ${claimed.id}`,
        );
      }

      const controller = new AbortController();
      const heartbeat = startLeaseHeartbeat(
        repository,
        claimed as ContentProductionItem & {
          leaseUntil: Date;
          leaseToken: string;
        },
        job.id,
        input.attempt,
        controller,
      );
      let outcome: ContentProductionItemOutcome;

      try {
        const seed = seedsBySourceRef.get(claimed.sourceRef);
        if (!seed || !claimed.leaseUntil || !claimed.leaseToken) {
          throw new Error(
            `구조화되지 않은 콘텐츠 제작 claim입니다: ${claimed.id}`,
          );
        }
        outcome = await processor.process(
          createContentProductionWorkItem(job as ContentProductionWorkerJob, {
            ...claimed,
            jobInputId: seed.jobInputId,
            operation: seed.operation,
            leaseUntil: claimed.leaseUntil,
            leaseToken: claimed.leaseToken,
          }),
          controller.signal,
        );
      } catch {
        outcome = {
          status: 'FAILED',
          retryable: true,
          errorCode: 'LOCAL_PROCESSOR_FAILURE',
        };
      } finally {
        await heartbeat.stop();
      }

      if (heartbeat.isLeaseLost()) {
        continue;
      }

      await repository.finishItem(
        job.id,
        claimed.id,
        input.attempt,
        claimed.leaseToken,
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
