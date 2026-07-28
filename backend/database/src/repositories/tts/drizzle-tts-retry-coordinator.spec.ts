/** TTS 재시도 상태와 durable outbox가 같은 transaction에서 전이되는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { ttsAudioCache, ttsItems, ttsJobs } from '../../schema/index.js';
import { DrizzleTtsRetryCoordinator } from './drizzle-tts-retry-coordinator.js';

const requestedAt = new Date('2026-07-28T01:00:00.000Z');
const jobId = '00000000-0000-4000-8000-000000000001';
const itemId = '00000000-0000-4000-8000-000000000002';
const secondItemId = '00000000-0000-4000-8000-000000000003';

const failedItem = {
  id: itemId,
  jobId,
  targetKind: 'THAI_SENTENCE_VERSION' as const,
  targetId: '00000000-0000-4000-8000-000000000004',
  targetText: 'สวัสดี',
  targetRequired: true,
  revision: '00000000-0000-4000-8000-000000000005',
  voiceSnapshot: {
    presetId: '00000000-0000-4000-8000-000000000006',
    provider: 'LOCAL_FAKE',
    model: 'deterministic-v1',
    voice: 'thai-female',
    locale: 'th-TH' as const,
    audioFormat: 'audio/wav' as const,
    generationRevision: 'v1',
  },
  cacheKey: 'cache-key',
  status: 'FAILED' as const,
  attempt: 2,
  leaseToken: null,
  leaseUntil: null,
  errorCode: 'PROVIDER_TIMEOUT',
  retryable: true,
  mediaAssetId: null,
  createdAt: requestedAt,
  updatedAt: requestedAt,
};

const createSelect = (results: unknown[][]) =>
  vi.fn(() => {
    const rows = results.shift() ?? [];
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      for: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows)),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  });

const createFixture = (results: unknown[][]) => {
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const update = vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updates.push({ table, values });
      return {
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: itemId }]),
        })),
      };
    }),
  }));
  const transactionExecutor = {
    select: createSelect(results),
    update,
  };
  const transaction = vi.fn(
    <T>(work: (value: typeof transactionExecutor) => Promise<T>) =>
      work(transactionExecutor),
  );
  return { database: { transaction }, transactionExecutor, updates };
};

const command = {
  jobId,
  itemIds: [itemId],
  expectedAttempts: { [itemId]: 2 },
  requestedAt,
};

describe('DrizzleTtsRetryCoordinator', () => {
  it('선택 item과 cache/job 전이 뒤 같은 transaction에 다음 attempt outbox를 쓴다', async () => {
    const fixture = createFixture([
      [failedItem],
      [{ id: jobId, dispatchAttempt: 0 }],
      [{ ...failedItem, status: 'PENDING', attempt: 3, retryable: false }],
    ]);
    const enqueueTts = vi.fn().mockResolvedValue(undefined);
    const coordinator = new DrizzleTtsRetryCoordinator(
      fixture.database as never,
      { enqueueTts },
    );

    await expect(coordinator.retryAndDispatch(command)).resolves.toBe(1);
    expect(
      fixture.updates.find(({ table }) => table === ttsItems)?.values,
    ).toMatchObject({
      status: 'PENDING',
      attempt: 3,
      errorCode: null,
      retryable: false,
    });
    expect(
      fixture.updates.find(({ table }) => table === ttsAudioCache)?.values,
    ).toMatchObject({
      status: 'PENDING',
      errorCode: null,
      retryable: false,
    });
    expect(
      fixture.updates.find(({ table }) => table === ttsJobs)?.values,
    ).toMatchObject({
      status: 'QUEUED',
      pendingCount: 1,
      failedCount: 0,
      dispatchAttempt: 1,
    });
    expect(enqueueTts).toHaveBeenCalledWith(fixture.transactionExecutor, {
      jobId,
      attempt: 1,
      requestedAt,
    });
  });

  it('같은 command replay는 상태를 다시 바꾸지 않고 같은 outbox identity만 확인한다', async () => {
    const replayed = {
      ...failedItem,
      status: 'PENDING' as const,
      attempt: 3,
      retryable: false,
      errorCode: null,
    };
    const fixture = createFixture([
      [replayed],
      [{ id: jobId, dispatchAttempt: 1 }],
    ]);
    const enqueueTts = vi.fn().mockResolvedValue(undefined);
    const coordinator = new DrizzleTtsRetryCoordinator(
      fixture.database as never,
      { enqueueTts },
    );

    await expect(coordinator.retryAndDispatch(command)).resolves.toBe(1);
    expect(fixture.updates).toHaveLength(0);
    expect(enqueueTts).not.toHaveBeenCalled();
  });

  it('빈 선택·다른 job·서로 다른 expected attempt를 fail closed한다', async () => {
    const cases = [
      {
        command: { ...command, itemIds: [], expectedAttempts: {} },
        rows: [],
        code: 'TTS_RETRY_ITEMS_REQUIRED',
      },
      {
        command,
        rows: [[{ ...failedItem, jobId: secondItemId }]],
        code: 'TTS_ITEM_NOT_FOUND',
      },
      {
        command: {
          ...command,
          itemIds: [itemId, secondItemId],
          expectedAttempts: { [itemId]: 2, [secondItemId]: 3 },
        },
        rows: [
          [
            failedItem,
            { ...failedItem, id: secondItemId, cacheKey: 'cache-key-2' },
          ],
        ],
        code: 'TTS_RETRY_ATTEMPT_MISMATCH',
      },
    ];

    for (const testCase of cases) {
      const fixture = createFixture(testCase.rows);
      const enqueueTts = vi.fn();
      const coordinator = new DrizzleTtsRetryCoordinator(
        fixture.database as never,
        { enqueueTts },
      );
      await expect(
        coordinator.retryAndDispatch(testCase.command),
      ).rejects.toMatchObject({ code: testCase.code });
      expect(fixture.updates).toHaveLength(0);
      expect(enqueueTts).not.toHaveBeenCalled();
    }
  });

  it('outbox 실패를 삼키지 않아 호출 transaction 전체가 rollback되게 한다', async () => {
    const fixture = createFixture([
      [failedItem],
      [{ id: jobId, dispatchAttempt: 0 }],
      [{ ...failedItem, status: 'PENDING', attempt: 3, retryable: false }],
    ]);
    const coordinator = new DrizzleTtsRetryCoordinator(
      fixture.database as never,
      {
        enqueueTts: vi.fn().mockRejectedValue(new Error('OUTBOX_FAILED')),
      },
    );

    await expect(coordinator.retryAndDispatch(command)).rejects.toThrow(
      'OUTBOX_FAILED',
    );
    expect(fixture.database.transaction).toHaveBeenCalledOnce();
  });
});
