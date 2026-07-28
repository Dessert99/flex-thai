/** local deterministic dispatcher의 부분 실패·멱등·stale attempt 처리를 검증한다 */
import { CONTENT_PRODUCTION_ITEM_LEASE_MS } from '@flex-thia/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createContentProductionProcessorRouter,
  createContentProductionDispatcher,
  type ContentProductionWorkerRepository,
} from './content-production-dispatcher.js';
import type {
  ContentProductionInput,
  ContentProductionItemSeed,
  ContentProductionPresetSnapshot,
  ContentProductionWorkItem,
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

const createRepository = (startAttemptResult: WorkerJobFixture | null) => {
  const items = [
    {
      id: 'item-1',
      sourceRef: 'input:0:question:0',
      status: 'PENDING' as const,
      attempt: 0,
      retryable: false,
      errorCode: null,
      leaseUntil: null,
      leaseToken: null,
    },
    {
      id: 'item-2',
      sourceRef: 'input:1:question:1',
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
            parameters:
              startAttemptResult.purpose === 'VOCABULARY_EXTRACTION'
                ? {}
                : {
                    questionCount: 2,
                    questionTypePlan: [
                      { questionTypeVersionId: 'type-version-id', count: 2 },
                    ],
                    difficultyPlan: [{ difficulty: 3, count: 2 }],
                  },
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
    areOperationItemsSuccessful: () => Promise.resolve(true),
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
      presetSnapshot: {
        id: 'preset-id',
        name: '연결 생성',
        purpose: 'VOCABULARY_THEN_QUESTION_GENERATION',
        version: 1,
        parameters: {
          questionCount: 1,
          questionTypePlan: [
            { questionTypeVersionId: 'type-version-id', count: 1 },
          ],
          difficultyPlan: [{ difficulty: 3, count: 1 }],
        },
      },
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
          questionPlan: null,
        },
      ],
      [
        {
          jobInputId: 'job-input-1',
          operation: 'QUESTION_GENERATION',
          sourceRef: 'input:0:question:0',
          questionPlan: {
            questionPlanIndex: 0,
            questionTypeVersionId: 'type-version-id',
            difficulty: 3,
          },
        },
      ],
    ]);
  });

  it('유형·난이도 계획을 총 문항 수만큼 안정적으로 펼치고 입력을 순환 배정한다', async () => {
    const { repository, ensured } = createRepository({
      id: 'job-id',
      attempt: 0,
      status: 'RUNNING',
      purpose: 'QUESTION_GENERATION',
      presetSnapshot: {
        id: 'preset-id',
        name: '문제 생성',
        purpose: 'QUESTION_GENERATION',
        version: 1,
        parameters: {
          questionCount: 4,
          questionTypePlan: [
            { questionTypeVersionId: 'type-b', count: 2 },
            { questionTypeVersionId: 'type-a', count: 2 },
          ],
          difficultyPlan: [
            { difficulty: 4, count: 2 },
            { difficulty: 2, count: 2 },
          ],
        },
      },
      inputs: [
        {
          jobInputId: 'input-a',
          ordinal: 0,
          uploadId: 'upload-a',
          inputType: 'TEXT',
          inputKey: 'a',
          sizeBytes: 1,
        },
        {
          jobInputId: 'input-b',
          ordinal: 1,
          uploadId: 'upload-b',
          inputType: 'TEXT',
          inputKey: 'b',
          sizeBytes: 1,
        },
      ],
    });
    await createContentProductionDispatcher(repository, {
      process: () =>
        Promise.resolve({
          status: 'SUCCEEDED',
          retryable: false,
          errorCode: null,
        }),
    })({ jobId: 'job-id', attempt: 0 });

    expect(ensured[0]).toEqual([
      expect.objectContaining({
        sourceRef: 'input:0:question:0',
        jobInputId: 'input-a',
        questionPlan: expect.objectContaining({
          questionTypeVersionId: 'type-a',
          difficulty: 2,
        }),
      }),
      expect.objectContaining({
        sourceRef: 'input:1:question:1',
        jobInputId: 'input-b',
      }),
      expect.objectContaining({
        sourceRef: 'input:0:question:2',
        jobInputId: 'input-a',
        questionPlan: expect.objectContaining({
          questionTypeVersionId: 'type-b',
          difficulty: 4,
        }),
      }),
      expect.objectContaining({
        sourceRef: 'input:1:question:3',
        jobInputId: 'input-b',
      }),
    ]);
  });

  it('복합 목적은 어휘 항목이 모두 성공하기 전 문제 항목을 만들지 않는다', async () => {
    const { repository, ensured } = createRepository({
      id: 'job-id',
      attempt: 0,
      status: 'RUNNING',
      purpose: 'VOCABULARY_THEN_QUESTION_GENERATION',
      presetSnapshot: {
        id: 'preset-id',
        name: '연결 생성',
        purpose: 'VOCABULARY_THEN_QUESTION_GENERATION',
        version: 1,
        parameters: {
          questionCount: 1,
          questionTypePlan: [
            { questionTypeVersionId: 'type-version-id', count: 1 },
          ],
          difficultyPlan: [{ difficulty: 3, count: 1 }],
        },
      },
      inputs: [
        {
          jobInputId: 'input-a',
          ordinal: 0,
          uploadId: 'upload-a',
          inputType: 'TEXT',
          inputKey: 'a',
          sizeBytes: 1,
        },
      ],
    });
    repository.areOperationItemsSuccessful = () => Promise.resolve(false);

    await createContentProductionDispatcher(repository, {
      process: () =>
        Promise.resolve({
          status: 'FAILED',
          retryable: true,
          errorCode: 'VOCABULARY_FAILED',
        }),
    })({ jobId: 'job-id', attempt: 0 });

    expect(ensured).toHaveLength(1);
    expect(ensured[0]?.[0]?.operation).toBe('VOCABULARY_EXTRACTION');
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
    const workItems: ContentProductionWorkItem[] = [];
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

    expect(workItems[0]?.jobId).toBe('job-id');
    expect(workItems[0]?.requestedBy).toBe('admin-id');
    expect(workItems[0]?.input).toMatchObject({
      jobInputId: 'job-input-1',
      inputKey: 'private/input.txt',
    });
    expect(workItems[0]?.item.operation).toBe('VOCABULARY_EXTRACTION');
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

describe('콘텐츠 제작 processor routing', () => {
  it('연결 작업의 어휘와 문제 항목을 operation별 processor에 exact work item으로 전달한다', async () => {
    const vocabularyProcess = vi.fn().mockResolvedValue({
      status: 'SUCCEEDED',
      retryable: false,
      errorCode: null,
    });
    const questionProcess = vi.fn().mockResolvedValue({
      status: 'NEEDS_ATTENTION',
      retryable: false,
      errorCode: 'NO_QUESTION_CANDIDATES',
    });
    const router = createContentProductionProcessorRouter({
      vocabulary: { process: vocabularyProcess },
      question: { process: questionProcess },
    });
    const vocabularyItem = {
      jobId: 'job-id',
      jobAttempt: 0,
      requestedBy: 'admin-id',
      purpose: 'VOCABULARY_THEN_QUESTION_GENERATION' as const,
      presetSnapshot: {
        id: 'preset-id',
        name: '연결 작업',
        purpose: 'VOCABULARY_THEN_QUESTION_GENERATION' as const,
        version: 1,
        parameters: {},
      },
      input: {
        jobInputId: 'job-input-id',
        ordinal: 0,
        uploadId: 'upload-id',
        inputType: 'TEXT' as const,
        inputKey: 'private/input.txt',
        sizeBytes: 3,
      },
      item: {
        id: 'vocabulary-item',
        sourceRef: 'input:0:vocabulary',
        jobInputId: 'job-input-id',
        operation: 'VOCABULARY_EXTRACTION' as const,
        questionPlan: null,
        status: 'PROCESSING' as const,
        attempt: 0,
        retryable: false,
        errorCode: null,
        leaseToken: 'vocabulary-lease',
        leaseUntil: new Date('2026-07-27T00:05:00.000Z'),
      },
    };
    const questionItem = {
      ...vocabularyItem,
      item: {
        ...vocabularyItem.item,
        id: 'question-item',
        sourceRef: 'input:0:question',
        operation: 'QUESTION_GENERATION' as const,
        questionPlan: {
          questionPlanIndex: 0,
          questionTypeVersionId: 'type-version-id',
          difficulty: 1 as const,
        },
        leaseToken: 'question-lease',
      },
    };
    const signal = new AbortController().signal;

    await expect(router.process(vocabularyItem, signal)).resolves.toMatchObject(
      {
        status: 'SUCCEEDED',
      },
    );
    await expect(router.process(questionItem, signal)).resolves.toMatchObject({
      status: 'NEEDS_ATTENTION',
    });

    expect(vocabularyProcess).toHaveBeenCalledWith(vocabularyItem, signal);
    expect(questionProcess).toHaveBeenCalledWith(questionItem, signal);
    expect(vocabularyProcess).toHaveBeenCalledOnce();
    expect(questionProcess).toHaveBeenCalledOnce();
  });
});
