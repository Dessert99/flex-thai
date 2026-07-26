/** local deterministic dispatcher의 부분 실패·멱등·stale attempt 처리를 검증한다 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createContentProductionDispatcher,
  type ContentProductionWorkerRepository,
} from './content-production-dispatcher.js';

const createRepository = (
  startAttemptResult: Awaited<
    ReturnType<ContentProductionWorkerRepository['startAttempt']>
  >,
) => {
  const items = [
    {
      id: 'item-1',
      sourceRef: 'input:0',
      status: 'PENDING' as const,
      attempt: 0,
      retryable: false,
      errorCode: null,
      leaseUntil: null,
      leaseToken: null,
    },
    {
      id: 'item-2',
      sourceRef: 'input:1:fail',
      status: 'PENDING' as const,
      attempt: 0,
      retryable: false,
      errorCode: null,
      leaseUntil: null,
      leaseToken: null,
    },
  ];
  const finished: Array<{ itemId: string; status: string }> = [];
  const ensured: string[][] = [];
  const repository: ContentProductionWorkerRepository = {
    startAttempt: () => Promise.resolve(startAttemptResult),
    ensureItems: (_jobId, sourceRefs) => {
      ensured.push(sourceRefs);
      return Promise.resolve();
    },
    listAttemptItems: () => Promise.resolve(items),
    startItem: (_jobId, itemId) => {
      const item = items.find((candidate) => candidate.id === itemId);
      return Promise.resolve(
        item
          ? {
              ...item,
              status: 'PROCESSING',
              leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
              leaseToken: `token:${itemId}`,
            }
          : null,
      );
    },
    renewItemLease: () => Promise.resolve(true),
    finishItem: (_jobId, itemId, _attempt, _leaseToken, outcome) => {
      finished.push({ itemId, status: outcome.status });
      return Promise.resolve(true);
    },
    finalizeAttempt: () =>
      Promise.resolve({
        jobId: 'job-id',
        status: 'COMPLETED_WITH_FAILURES',
      }),
  };
  return { repository, finished, ensured };
};

describe('콘텐츠 제작 dispatcher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('한 항목 실패 뒤에도 다음 항목을 처리하고 부분 실패로 집계한다', async () => {
    const { repository, finished } = createRepository({
      id: 'job-id',
      attempt: 0,
      status: 'RUNNING',
      purpose: 'QUESTION_GENERATION',
      inputs: [
        {
          uploadId: 'upload-1',
          inputType: 'TEXT',
          inputKey: 'a',
          sizeBytes: 1,
        },
        {
          uploadId: 'upload-2',
          inputType: 'TEXT',
          inputKey: 'b',
          sizeBytes: 1,
        },
      ],
    });
    const dispatch = createContentProductionDispatcher(repository, {
      process(item) {
        return Promise.resolve(
          item.sourceRef.endsWith(':fail')
            ? {
                status: 'FAILED',
                retryable: true,
                errorCode: 'LOCAL_FAKE_FAILURE',
              }
            : { status: 'SUCCEEDED', retryable: false, errorCode: null },
        );
      },
    });

    await expect(dispatch({ jobId: 'job-id', attempt: 0 })).resolves.toEqual({
      jobId: 'job-id',
      status: 'COMPLETED_WITH_FAILURES',
    });
    expect(finished).toEqual([
      { itemId: 'item-1', status: 'SUCCEEDED' },
      { itemId: 'item-2', status: 'FAILED' },
    ]);
  });

  it('어휘 다음 문제 생성 목적은 입력마다 두 단계 항목을 만든다', async () => {
    const { repository, ensured } = createRepository({
      id: 'job-id',
      attempt: 0,
      status: 'RUNNING',
      purpose: 'VOCABULARY_THEN_QUESTION_GENERATION',
      inputs: [
        {
          uploadId: 'upload-1',
          inputType: 'TEXT',
          inputKey: 'a',
          sizeBytes: 1,
        },
      ],
    });
    const dispatch = createContentProductionDispatcher(repository, {
      process: () =>
        Promise.resolve({
          status: 'SUCCEEDED',
          retryable: false,
          errorCode: null,
        }),
    });

    await dispatch({ jobId: 'job-id', attempt: 0 });

    expect(ensured).toEqual([['input:0:vocabulary', 'input:0:question']]);
  });

  it('stale attempt와 terminal 재전달은 항목을 다시 처리하지 않는다', async () => {
    const { repository } = createRepository(null);
    let processCount = 0;
    const dispatch = createContentProductionDispatcher(repository, {
      process() {
        processCount += 1;
        return Promise.resolve({
          status: 'SUCCEEDED',
          retryable: false,
          errorCode: null,
        });
      },
    });

    await expect(dispatch({ jobId: 'job-id', attempt: 0 })).resolves.toEqual({
      jobId: 'job-id',
      status: 'IGNORED',
    });
    expect(processCount).toBe(0);
  });

  it('6분 처리 중 heartbeat로 lease를 연장하고 완료 뒤 timer를 정리한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T00:00:00.000Z'));
    const { repository } = createRepository({
      id: 'job-id',
      attempt: 0,
      status: 'RUNNING',
      purpose: 'QUESTION_GENERATION',
      inputs: [
        {
          uploadId: 'upload-1',
          inputType: 'TEXT',
          inputKey: 'a',
          sizeBytes: 1,
        },
      ],
    });
    const renewItemLease = vi.spyOn(repository, 'renewItemLease');
    let finishProcess!: (value: {
      status: 'SUCCEEDED';
      retryable: false;
      errorCode: null;
    }) => void;
    const processPromise = new Promise<{
      status: 'SUCCEEDED';
      retryable: false;
      errorCode: null;
    }>((resolve) => {
      finishProcess = resolve;
    });
    let processCount = 0;
    const dispatch = createContentProductionDispatcher(repository, {
      process: () => {
        processCount += 1;

        if (processCount > 1) {
          return Promise.resolve({
            status: 'SUCCEEDED',
            retryable: false,
            errorCode: null,
          });
        }

        return processPromise;
      },
    });

    const running = dispatch({ jobId: 'job-id', attempt: 0 });
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

    expect(renewItemLease).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    finishProcess({
      status: 'SUCCEEDED',
      retryable: false,
      errorCode: null,
    });
    await running;

    expect(vi.getTimerCount()).toBe(0);
  });
});
