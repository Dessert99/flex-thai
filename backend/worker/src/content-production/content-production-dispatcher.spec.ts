/** local deterministic dispatcher의 부분 실패·멱등·stale attempt 처리를 검증한다 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createContentProductionDispatcher,
  type ContentProductionWorkerRepository,
} from './content-production-dispatcher.js';
import type {
  ContentProductionInput,
  ContentProductionPresetSnapshot,
} from '@flex-thia/domain/content-production/content-production.service';
import type {
  ContentProductionItemSeed,
  ContentProductionWorkItem,
  ContentProductionWorkerJob,
} from '@flex-thia/domain/content-production/content-production-work-item';

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
});
