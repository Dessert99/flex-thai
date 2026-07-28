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
    const commandFingerprint =
      DrizzleTtsRetryCoordinator.commandFingerprint(command);
    const fixture = createFixture([
      [failedItem],
      [
        {
          id: jobId,
          dispatchAttempt: 0,
          lastDispatchCommandFingerprint: null,
        },
      ],
      [{ ...failedItem, status: 'PENDING', attempt: 3, retryable: false }],
    ]);
    const enqueueTts = vi.fn().mockResolvedValue(undefined);
    const assertTtsDispatch = vi.fn();
    const coordinator = new DrizzleTtsRetryCoordinator(
      fixture.database as never,
      { enqueueTts, assertTtsDispatch },
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
      commandFingerprint,
      requestedAt,
    });
  });

  it('서로 다른 이력의 항목을 각 expected attempt로 한 배치에서 재시도한다', async () => {
    const secondFailed = {
      ...failedItem,
      id: secondItemId,
      cacheKey: 'cache-key-2',
      attempt: 5,
    };
    const fixture = createFixture([
      [failedItem, secondFailed],
      [
        {
          id: jobId,
          dispatchAttempt: 7,
          lastDispatchCommandFingerprint: 'old-command',
        },
      ],
      [
        { ...failedItem, status: 'PENDING', attempt: 3, retryable: false },
        { ...secondFailed, status: 'PENDING', attempt: 6, retryable: false },
      ],
    ]);
    const enqueueTts = vi.fn().mockResolvedValue(undefined);
    const coordinator = new DrizzleTtsRetryCoordinator(
      fixture.database as never,
      { enqueueTts, assertTtsDispatch: vi.fn() },
    );

    const mixedCommand = {
      ...command,
      itemIds: [secondItemId, itemId],
      expectedAttempts: { [itemId]: 2, [secondItemId]: 5 },
    };
    const commandFingerprint =
      DrizzleTtsRetryCoordinator.commandFingerprint(mixedCommand);

    await expect(coordinator.retryAndDispatch(mixedCommand)).resolves.toBe(2);
    expect(
      fixture.updates
        .filter(({ table }) => table === ttsItems)
        .map(({ values }) => values.attempt),
    ).toEqual([3, 6]);
    expect(
      fixture.updates.find(({ table }) => table === ttsJobs)?.values,
    ).toMatchObject({
      dispatchAttempt: 8,
      lastDispatchCommandFingerprint: commandFingerprint,
    });
    expect(enqueueTts).toHaveBeenCalledWith(
      fixture.transactionExecutor,
      expect.objectContaining({
        jobId,
        attempt: 8,
        commandFingerprint,
      }),
    );
  });

  it('같은 command replay는 job fingerprint와 정확한 outbox가 모두 있을 때만 성공한다', async () => {
    const replayed = {
      ...failedItem,
      status: 'PENDING' as const,
      attempt: 3,
      retryable: false,
      errorCode: null,
    };
    const fixture = createFixture([
      [replayed],
      [
        {
          id: jobId,
          dispatchAttempt: 1,
          lastDispatchCommandFingerprint: 'placeholder',
        },
      ],
    ]);
    const enqueueTts = vi.fn().mockResolvedValue(undefined);
    const assertTtsDispatch = vi.fn().mockResolvedValue(undefined);
    const coordinator = new DrizzleTtsRetryCoordinator(
      fixture.database as never,
      { enqueueTts, assertTtsDispatch },
    );

    const fingerprint = DrizzleTtsRetryCoordinator.commandFingerprint(command);
    fixture.transactionExecutor.select = createSelect([
      [replayed],
      [
        {
          id: jobId,
          dispatchAttempt: 1,
          lastDispatchCommandFingerprint: fingerprint,
        },
      ],
    ]);

    await expect(coordinator.retryAndDispatch(command)).resolves.toBe(1);
    expect(fixture.updates).toHaveLength(0);
    expect(enqueueTts).not.toHaveBeenCalled();
    expect(assertTtsDispatch).toHaveBeenCalledWith(
      fixture.transactionExecutor,
      {
        jobId,
        attempt: 1,
        commandFingerprint: fingerprint,
      },
    );
  });

  it.each([
    [
      '빠르게 실패',
      {
        status: 'FAILED' as const,
        errorCode: 'PROVIDER_TIMEOUT',
        retryable: true,
      },
    ],
    [
      '빠르게 성공',
      {
        status: 'SUCCEEDED' as const,
        errorCode: null,
        retryable: false,
      },
    ],
  ])(
    '동일 retry command가 %s한 뒤에도 exact replay로 성공한다',
    async (_, outcome) => {
      const fingerprint =
        DrizzleTtsRetryCoordinator.commandFingerprint(command);
      const replayed = {
        ...failedItem,
        ...outcome,
        attempt: 3,
      };
      const fixture = createFixture([
        [replayed],
        [
          {
            id: jobId,
            dispatchAttempt: 1,
            lastDispatchCommandFingerprint: fingerprint,
          },
        ],
      ]);
      const assertTtsDispatch = vi.fn().mockResolvedValue(undefined);
      const coordinator = new DrizzleTtsRetryCoordinator(
        fixture.database as never,
        { enqueueTts: vi.fn(), assertTtsDispatch },
      );

      await expect(coordinator.retryAndDispatch(command)).resolves.toBe(1);
      expect(fixture.updates).toHaveLength(0);
      expect(assertTtsDispatch).toHaveBeenCalledWith(
        fixture.transactionExecutor,
        {
          jobId,
          attempt: 1,
          commandFingerprint: fingerprint,
        },
      );
    },
  );

  it('동일 item attempt가 한 번 더 전진했으면 이전 retry command replay를 거부한다', async () => {
    const fingerprint = DrizzleTtsRetryCoordinator.commandFingerprint(command);
    const fixture = createFixture([
      [{ ...failedItem, status: 'PENDING' as const, attempt: 4 }],
      [
        {
          id: jobId,
          dispatchAttempt: 2,
          lastDispatchCommandFingerprint: fingerprint,
        },
      ],
    ]);
    const assertTtsDispatch = vi.fn();
    const coordinator = new DrizzleTtsRetryCoordinator(
      fixture.database as never,
      { enqueueTts: vi.fn(), assertTtsDispatch },
    );

    await expect(coordinator.retryAndDispatch(command)).rejects.toMatchObject({
      code: 'TTS_ITEM_STALE_ATTEMPT',
    });
    expect(assertTtsDispatch).not.toHaveBeenCalled();
  });

  it('이미 따로 재시도된 항목의 미발행 복합 선택과 outbox 없는 상태 replay를 거부한다', async () => {
    const retried = {
      ...failedItem,
      status: 'PENDING' as const,
      attempt: 3,
      retryable: false,
      errorCode: null,
    };
    const secondRetried = {
      ...retried,
      id: secondItemId,
      attempt: 6,
      cacheKey: 'cache-key-2',
    };
    const composite = {
      ...command,
      itemIds: [itemId, secondItemId],
      expectedAttempts: { [itemId]: 2, [secondItemId]: 5 },
    };
    const compositeFingerprint =
      DrizzleTtsRetryCoordinator.commandFingerprint(composite);
    const fixture = createFixture([
      [retried, secondRetried],
      [
        {
          id: jobId,
          dispatchAttempt: 2,
          lastDispatchCommandFingerprint: 'different-issued-command',
        },
      ],
    ]);
    const coordinator = new DrizzleTtsRetryCoordinator(
      fixture.database as never,
      {
        enqueueTts: vi.fn(),
        assertTtsDispatch: vi.fn(),
      },
    );
    expect(compositeFingerprint).not.toBe('different-issued-command');
    await expect(coordinator.retryAndDispatch(composite)).rejects.toMatchObject(
      {
        code: 'TTS_ITEM_STALE_ATTEMPT',
      },
    );

    const exactFingerprint =
      DrizzleTtsRetryCoordinator.commandFingerprint(command);
    const stateOnly = createFixture([
      [retried],
      [
        {
          id: jobId,
          dispatchAttempt: 1,
          lastDispatchCommandFingerprint: exactFingerprint,
        },
      ],
    ]);
    const assertTtsDispatch = vi
      .fn()
      .mockRejectedValue(new Error('OUTBOX_MISSING'));
    const stateOnlyCoordinator = new DrizzleTtsRetryCoordinator(
      stateOnly.database as never,
      { enqueueTts: vi.fn(), assertTtsDispatch },
    );
    await expect(
      stateOnlyCoordinator.retryAndDispatch(command),
    ).rejects.toThrow('OUTBOX_MISSING');
  });

  it('빈 선택·다른 job·잘못된 expected attempt map을 fail closed한다', async () => {
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
          expectedAttempts: { [itemId]: -1 },
        },
        rows: [],
        code: 'TTS_RETRY_ATTEMPT_MISMATCH',
      },
    ];

    for (const testCase of cases) {
      const fixture = createFixture(testCase.rows);
      const enqueueTts = vi.fn();
      const coordinator = new DrizzleTtsRetryCoordinator(
        fixture.database as never,
        { enqueueTts, assertTtsDispatch: vi.fn() },
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
      [
        {
          id: jobId,
          dispatchAttempt: 0,
          lastDispatchCommandFingerprint: null,
        },
      ],
      [{ ...failedItem, status: 'PENDING', attempt: 3, retryable: false }],
    ]);
    const coordinator = new DrizzleTtsRetryCoordinator(
      fixture.database as never,
      {
        enqueueTts: vi.fn().mockRejectedValue(new Error('OUTBOX_FAILED')),
        assertTtsDispatch: vi.fn(),
      },
    );

    await expect(coordinator.retryAndDispatch(command)).rejects.toThrow(
      'OUTBOX_FAILED',
    );
    expect(fixture.database.transaction).toHaveBeenCalledOnce();
  });
});
