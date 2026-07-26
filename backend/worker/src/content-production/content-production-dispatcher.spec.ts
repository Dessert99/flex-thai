/** local deterministic dispatcher의 부분 실패·멱등·stale attempt 처리를 검증한다 */
import { CONTENT_PRODUCTION_ITEM_LEASE_MS } from '@flex-thia/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createContentProductionDispatcher,
  type ContentProductionWorkerRepository,
} from './content-production-dispatcher.js';
import type {
  ContentProductionInput,
  ContentProductionItemSeed,
  ContentProductionPresetSnapshot,
  ContentProductionWorkerJob,
} from '@flex-thia/domain';

type WorkerJobFixture = Omit<
  ContentProductionWorkerJob,
  'inputs' | 'presetSnapshot' | 'requestedBy'
> & {
  inputs: Array<
    ContentProductionInput & {
      jobInputId?: string;
      ordinal?: number;
    }
  >;
  presetSnapshot?: ContentProductionPresetSnapshot;
  requestedBy?: string;
  status: 'RUNNING';
};

const createRepository = (
  startAttemptResult: WorkerJobFixture | null,
) => {
  const items = [
    {
      id: 'item-1',
      sourceRef: 'input:0:question',
      status: 'PENDING' as const,
      attempt: 0,
      retryable: false,
      errorCode: null,
      leaseUntil: null,
      leaseToken: null,
    },
    {
      id: 'item-2',
      sourceRef: 'input:1:question',
      status: 'PENDING' as const,
      attempt: 0,
      retryable: false,
      errorCode: null,
      leaseUntil: null,
      leaseToken: null,
    },
  ];
  const finished: Array<{ itemId: string; status: string }> = [];
  const ensured: ContentProductionItemSeed[][] = [];
  const normalizedJob = startAttemptResult
    ? {
        ...startAttemptResult,
        requestedBy: startAttemptResult.requestedBy ?? 'admin-id',
        presetSnapshot:
          startAttemptResult.presetSnapshot ??
          ({
            id: 'preset-id',
            name: '테스트 preset',
            purpose: startAttemptResult.purpose,
            version: 1,
            parameters: {},
          } satisfies ContentProductionPresetSnapshot),
        inputs: startAttemptResult.inputs.map((input, ordinal) => ({
          ...input,
          jobInputId: input.jobInputId ?? `job-input-${ordinal}`,
          ordinal: input.ordinal ?? ordinal,
        })),
      }
    : null;
  const repository: ContentProductionWorkerRepository = {
    startAttempt: () => Promise.resolve(normalizedJob),
    ensureItems: (_jobId, seeds) => {
      ensured.push(seeds);
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
  return { repository, finished, ensured, items };
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
      process(workItem) {
        return Promise.resolve(
          workItem.input.ordinal === 1
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
          jobInputId: 'job-input-1',
          ordinal: 0,
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

    expect(ensured).toEqual([
      [
        {
          jobInputId: 'job-input-1',
          operation: 'VOCABULARY_EXTRACTION',
          sourceRef: 'input:0:vocabulary',
        },
        {
          jobInputId: 'job-input-1',
          operation: 'QUESTION_GENERATION',
          sourceRef: 'input:0:question',
        },
      ],
    ]);
  });

  it('processor에 exact input과 작업 snapshot을 구조화해 전달한다', async () => {
    const { repository, items } = createRepository({
      id: 'job-id',
      attempt: 0,
      status: 'RUNNING',
      requestedBy: 'admin-id',
      purpose: 'VOCABULARY_EXTRACTION',
      presetSnapshot: {
        id: 'preset-id',
        name: '어휘 추출',
        purpose: 'VOCABULARY_EXTRACTION',
        version: 1,
        parameters: {},
      },
      inputs: [
        {
          jobInputId: 'job-input-1',
          ordinal: 0,
          uploadId: 'upload-1',
          inputType: 'TEXT',
          inputKey: 'private/input.txt',
          sizeBytes: 1,
        },
      ],
    });
    repository.listAttemptItems = () =>
      Promise.resolve([
        {
          ...items[0]!,
          sourceRef: 'input:0:vocabulary',
          jobInputId: 'job-input-1',
          operation: 'VOCABULARY_EXTRACTION',
        },
      ]);
    const startItem = repository.startItem.bind(repository);
    repository.startItem = async (...args) => ({
      ...(await startItem(...args))!,
      sourceRef: 'input:0:vocabulary',
      jobInputId: 'job-input-1',
      operation: 'VOCABULARY_EXTRACTION',
    });
    const workItems: unknown[] = [];
    const dispatch = createContentProductionDispatcher(repository, {
      process(workItem) {
        workItems.push(workItem);
        return Promise.resolve({
          status: 'SUCCEEDED',
          retryable: false,
          errorCode: null,
        });
      },
    });

    await dispatch({ jobId: 'job-id', attempt: 0 });

    expect(workItems).toEqual([
      expect.objectContaining({
        jobId: 'job-id',
        requestedBy: 'admin-id',
        input: expect.objectContaining({
          jobInputId: 'job-input-1',
          inputKey: 'private/input.txt',
        }),
        item: expect.objectContaining({
          operation: 'VOCABULARY_EXTRACTION',
        }),
      }),
    ]);
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

  it('첫 heartbeat 오류를 만료 전 재시도로 복구한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T00:00:00.000Z'));
    const { repository, items } = createRepository({
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
    repository.listAttemptItems = () => Promise.resolve(items.slice(0, 1));
    const claimItem = repository.startItem.bind(repository);
    let activeToken: string | null = null;
    let leaseDeadline = 0;
    repository.startItem = async (...args) => {
      if (activeToken && Date.now() < leaseDeadline) {
        return null;
      }

      const claimed = await claimItem(...args);
      activeToken = claimed?.leaseToken ?? null;
      leaseDeadline = claimed?.leaseUntil?.getTime() ?? 0;
      return claimed;
    };
    let renewCount = 0;
    const renewItemLease = vi.fn((_jobId, _itemId, _attempt, leaseToken) => {
      renewCount += 1;

      if (renewCount === 1) {
        return Promise.reject(new Error('temporary database error'));
      }

      if (leaseToken !== activeToken) {
        return Promise.resolve(false);
      }

      leaseDeadline = Date.now() + CONTENT_PRODUCTION_ITEM_LEASE_MS;
      return Promise.resolve(true);
    });
    repository.renewItemLease = renewItemLease;
    let signal!: AbortSignal;
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
    const dispatch = createContentProductionDispatcher(repository, {
      process: (_item, processSignal) => {
        signal = processSignal;
        return processPromise;
      },
    });
    const finishItem = vi.spyOn(repository, 'finishItem');

    const running = dispatch({ jobId: 'job-id', attempt: 0 });
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);

    expect(renewItemLease).toHaveBeenCalledTimes(3);
    expect(signal.aborted).toBe(false);
    await expect(
      repository.startItem('job-id', 'item-1', 0),
    ).resolves.toBeNull();

    finishProcess({
      status: 'SUCCEEDED',
      retryable: false,
      errorCode: null,
    });
    await running;

    expect(finishItem).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('heartbeat가 token을 거부하면 processor를 취소하고 결과를 저장하지 않는다', async () => {
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
    const [item] = await repository.listAttemptItems('job-id', 0);
    repository.listAttemptItems = () => Promise.resolve([item!]);
    repository.renewItemLease = () => Promise.resolve(false);
    let signal!: AbortSignal;
    const dispatch = createContentProductionDispatcher(repository, {
      process: (_item, processSignal) => {
        signal = processSignal;
        return new Promise((_resolve, reject) => {
          processSignal.addEventListener(
            'abort',
            () => reject(new Error('lease lost')),
            { once: true },
          );
        });
      },
    });
    const finishItem = vi.spyOn(repository, 'finishItem');

    const running = dispatch({ jobId: 'job-id', attempt: 0 });
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await running;

    expect(signal.aborted).toBe(true);
    expect(finishItem).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('heartbeat 오류가 lease 경계까지 계속되면 processor를 취소한다', async () => {
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
    const [item] = await repository.listAttemptItems('job-id', 0);
    repository.listAttemptItems = () => Promise.resolve([item!]);
    repository.renewItemLease = () =>
      Promise.reject(new Error('database unavailable'));
    let signal!: AbortSignal;
    const dispatch = createContentProductionDispatcher(repository, {
      process: (_item, processSignal) => {
        signal = processSignal;
        return new Promise((_resolve, reject) => {
          processSignal.addEventListener(
            'abort',
            () => reject(new Error('lease expired')),
            { once: true },
          );
        });
      },
    });
    const finishItem = vi.spyOn(repository, 'finishItem');

    const running = dispatch({ jobId: 'job-id', attempt: 0 });
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    await running;

    expect(signal.aborted).toBe(true);
    expect(finishItem).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
