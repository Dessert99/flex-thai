/** TTS 저장소의 claim·lease·부분 실패 원자성을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { ttsAudioCache, ttsItems, ttsJobs } from '../../schema/tts.schema.js';
import { DrizzleTtsRepository } from './drizzle-tts.repository.js';

const now = new Date('2026-07-27T05:00:00.000Z');
const jobId = '00000000-0000-4000-8000-000000000001';
const itemId = '00000000-0000-4000-8000-000000000002';
const secondItemId = '00000000-0000-4000-8000-000000000003';
const mediaAssetId = '00000000-0000-4000-8000-000000000004';

const voice = {
  presetId: '00000000-0000-4000-8000-000000000005',
  provider: 'LOCAL_FAKE',
  model: 'deterministic-v1',
  voice: 'thai-female',
  locale: 'th-TH' as const,
  audioFormat: 'audio/wav' as const,
  generationRevision: 'v1',
};

const processingItem = {
  id: itemId,
  jobId,
  targetKind: 'THAI_SENTENCE_VERSION' as const,
  targetId: '00000000-0000-4000-8000-000000000006',
  targetText: 'สวัสดี',
  targetRequired: true,
  revision: 'revision-1',
  voiceSnapshot: voice,
  cacheKey: 'cache-key',
  status: 'PROCESSING' as const,
  attempt: 0,
  leaseToken: 'lease-token',
  leaseUntil: new Date('2026-07-27T05:05:00.000Z'),
  errorCode: null,
  retryable: false,
  mediaAssetId: null,
  createdAt: now,
  updatedAt: now,
};

const toWorkItem = (row = processingItem) => ({
  jobId: row.jobId,
  itemId: row.id,
  attempt: row.attempt,
  leaseToken: row.leaseToken ?? 'lease-token',
  leaseUntil: row.leaseUntil ?? new Date('2026-07-27T05:05:00.000Z'),
  target: {
    kind: row.targetKind,
    targetId: row.targetId,
    text: row.targetText,
    required: row.targetRequired,
    revision: row.revision,
  },
  voice: row.voiceSnapshot,
  cacheKey: row.cacheKey,
});

const job = {
  id: jobId,
  requestedBy: '00000000-0000-4000-8000-000000000007',
  voiceSnapshot: voice,
  status: 'RUNNING' as const,
  pendingCount: 0,
  processingCount: 1,
  succeededCount: 0,
  failedCount: 0,
  createdAt: now,
  startedAt: now,
  finishedAt: null,
  updatedAt: now,
};

const selectChain = (rows: unknown[]) => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    for: vi.fn(),
    limit: vi.fn(),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.for.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
};

const createSelect = (...results: unknown[][]) => {
  const chains = results.map(selectChain);
  return vi.fn(() => chains.shift() ?? selectChain([]));
};

const createUpdate = (...returningRows: unknown[][]) => {
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const update = vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updates.push({ table, values });
      return {
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(returningRows.shift() ?? []),
        })),
      };
    }),
  }));
  return { update, updates };
};

const createInsert = (...returningRows: unknown[][]) =>
  vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(returningRows.shift() ?? [])),
      })),
      returning: vi.fn(() => Promise.resolve(returningRows.shift() ?? [])),
    })),
  }));

const passthroughTransaction = (transaction: Record<string, unknown>) =>
  vi.fn(<T>(work: (value: typeof transaction) => Promise<T>) =>
    work(transaction),
  );

describe('DrizzleTtsRepository 음성 claim', () => {
  it('cache 생성 insert는 unique 충돌을 무시하고 소유권이 없으면 outcome unknown을 반환한다', async () => {
    const firstSelect = createSelect([]);
    const firstInsert = createInsert([{ id: 'cache-id' }]);
    const first = new DrizzleTtsRepository(
      {
        select: firstSelect,
        insert: firstInsert,
        transaction: passthroughTransaction({
          select: firstSelect,
          insert: firstInsert,
        }),
      } as never,
      { attach: async () => 'ATTACHED' },
      () => now,
    );
    const secondSelect = createSelect(
      [],
      [{ status: 'GENERATING', mediaAssetId: null }],
    );
    const secondInsert = createInsert([]);
    const second = new DrizzleTtsRepository(
      {
        select: secondSelect,
        insert: secondInsert,
        transaction: passthroughTransaction({
          select: secondSelect,
          insert: secondInsert,
        }),
      } as never,
      { attach: async () => 'ATTACHED' },
      () => now,
    );

    await expect(first.claimAudio('same-key')).resolves.toEqual(
      expect.objectContaining({ kind: 'GENERATE' }),
    );
    await expect(second.claimAudio('same-key')).resolves.toEqual({
      kind: 'OUTCOME_UNKNOWN',
    });
    const conflict =
      secondInsert.mock.results[0]?.value.values.mock.results[0]?.value
        .onConflictDoNothing;
    expect(conflict).toHaveBeenCalledOnce();
  });

  it('READY cache는 기존 media asset을 재생성 없이 replay한다', async () => {
    const select = createSelect([{ status: 'READY', mediaAssetId }]);
    const insert = createInsert();
    const repository = new DrizzleTtsRepository(
      {
        select,
        insert,
        transaction: passthroughTransaction({ select, insert }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );

    await expect(repository.claimAudio('ready-key')).resolves.toEqual({
      kind: 'REUSE',
      mediaAssetId,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('남은 generating claim은 외부 호출을 다시 하지 않도록 outcome unknown을 반환한다', async () => {
    const select = createSelect([{ status: 'GENERATING', mediaAssetId: null }]);
    const insert = createInsert();
    const repository = new DrizzleTtsRepository(
      {
        select,
        insert,
        transaction: passthroughTransaction({ select, insert }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );

    await expect(repository.claimAudio('active-key')).resolves.toEqual({
      kind: 'OUTCOME_UNKNOWN',
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('DrizzleTtsRepository lease와 완료 transaction', () => {
  it('만료된 lease의 success는 item·cache·attachment를 변경하지 않는다', async () => {
    const select = createSelect([]);
    const { update, updates } = createUpdate();
    const repository = new DrizzleTtsRepository(
      {
        select,
        update,
        transaction: passthroughTransaction({ select, update }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );

    await expect(
      repository.succeed({
        kind: 'GENERATED',
        item: toWorkItem(),
        mediaAssetId,
        claimToken: 'claim-token',
        completedAt: now,
      }),
    ).resolves.toBe(false);
    expect(updates).toEqual([]);
  });

  it('대상 연결이 stale이면 cache·item 완료를 commit하지 않는다', async () => {
    const select = createSelect([processingItem]);
    const { update } = createUpdate([{ id: 'cache-id' }], [{ id: itemId }]);
    let committed = false;
    let rolledBack = false;
    const transactionValue = { select, update };
    const transaction = vi.fn(
      async <T>(
        work: (value: {
          select: typeof select;
          update: typeof update;
        }) => Promise<T>,
      ) => {
        try {
          const value = await work(transactionValue);
          committed = true;
          return value;
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
    );
    const attach = vi.fn(async () => 'STALE_TARGET' as const);
    const repository = new DrizzleTtsRepository(
      { select, update, transaction } as never,
      { attach },
    );

    await expect(
      repository.succeed({
        kind: 'GENERATED',
        item: toWorkItem(),
        mediaAssetId,
        claimToken: 'claim-token',
        completedAt: now,
      }),
    ).resolves.toBe(false);
    expect(rolledBack).toBe(true);
    expect(committed).toBe(false);
    expect(attach).toHaveBeenCalledWith(
      transactionValue,
      expect.objectContaining({ mediaAssetId }),
    );
  });

  it('READY 재사용 완료는 생성 claim 없이 기존 media를 같은 transaction에서 연결한다', async () => {
    const readyCache = {
      status: 'READY' as const,
      cacheKey: processingItem.cacheKey,
      mediaAssetId,
    };
    const select = createSelect(
      [processingItem],
      [readyCache],
      [job],
      [{ ...processingItem, status: 'SUCCEEDED' as const, mediaAssetId }],
    );
    const { update, updates } = createUpdate([{ id: itemId }]);
    const transactionValue = { select, update };
    const attach = vi.fn(async () => 'ATTACHED' as const);
    const repository = new DrizzleTtsRepository(
      {
        select,
        update,
        transaction: passthroughTransaction(transactionValue),
      } as never,
      { attach },
    );

    await expect(
      repository.succeed({
        kind: 'REUSED',
        item: toWorkItem(),
        mediaAssetId,
        completedAt: now,
      }),
    ).resolves.toBe(true);
    expect(updates.some((entry) => entry.table === ttsAudioCache)).toBe(false);
    expect(attach).toHaveBeenCalledWith(
      transactionValue,
      expect.objectContaining({ mediaAssetId }),
    );
  });

  it('같은 key의 두 item은 provider 생성 한 번 뒤 두 번째 item을 READY media로 완료한다', async () => {
    let providerCalls = 0;
    const firstClaimSelect = createSelect([]);
    const firstClaimInsert = createInsert([{ id: 'cache-id' }]);
    const firstClaimRepository = new DrizzleTtsRepository(
      {
        select: firstClaimSelect,
        insert: firstClaimInsert,
        transaction: passthroughTransaction({
          select: firstClaimSelect,
          insert: firstClaimInsert,
        }),
      } as never,
      { attach: async () => 'ATTACHED' },
      () => now,
    );
    const firstClaim = await firstClaimRepository.claimAudio('cache-key');
    if (firstClaim.kind === 'GENERATE') providerCalls += 1;
    expect(firstClaim.kind).toBe('GENERATE');
    if (firstClaim.kind !== 'GENERATE') throw new Error('GENERATE_REQUIRED');

    const firstSelect = createSelect(
      [processingItem],
      [job],
      [{ ...processingItem, status: 'SUCCEEDED' as const, mediaAssetId }],
    );
    const firstUpdate = createUpdate(
      [{ id: 'cache-id' }],
      [{ id: itemId }],
    ).update;
    const firstRepository = new DrizzleTtsRepository(
      {
        select: firstSelect,
        update: firstUpdate,
        transaction: passthroughTransaction({
          select: firstSelect,
          update: firstUpdate,
        }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );
    await expect(
      firstRepository.succeed({
        kind: 'GENERATED',
        item: toWorkItem(),
        mediaAssetId,
        claimToken: firstClaim.claimToken,
        completedAt: now,
      }),
    ).resolves.toBe(true);

    const reuseClaimSelect = createSelect([{ status: 'READY', mediaAssetId }]);
    const reuseClaimRepository = new DrizzleTtsRepository(
      {
        select: reuseClaimSelect,
        transaction: passthroughTransaction({ select: reuseClaimSelect }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );
    const reuseClaim = await reuseClaimRepository.claimAudio('cache-key');
    expect(reuseClaim).toEqual({ kind: 'REUSE', mediaAssetId });
    expect(providerCalls).toBe(1);

    const secondProcessing = {
      ...processingItem,
      id: secondItemId,
      targetId: '00000000-0000-4000-8000-000000000008',
    };
    const secondSelect = createSelect(
      [secondProcessing],
      [{ status: 'READY', mediaAssetId }],
      [job],
      [
        { ...processingItem, status: 'SUCCEEDED' as const, mediaAssetId },
        { ...secondProcessing, status: 'SUCCEEDED' as const, mediaAssetId },
      ],
    );
    const secondUpdate = createUpdate([{ id: secondItemId }]).update;
    const secondRepository = new DrizzleTtsRepository(
      {
        select: secondSelect,
        update: secondUpdate,
        transaction: passthroughTransaction({
          select: secondSelect,
          update: secondUpdate,
        }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );
    await expect(
      secondRepository.succeed({
        kind: 'REUSED',
        item: toWorkItem(secondProcessing),
        mediaAssetId,
        completedAt: now,
      }),
    ).resolves.toBe(true);
  });
});

describe('DrizzleTtsRepository 부분 실패와 재시도', () => {
  it('한 item 실패 뒤에도 다른 pending item을 claim하고 job을 PARTIALLY_FAILED로 집계한다', async () => {
    const failed = {
      ...processingItem,
      status: 'FAILED' as const,
      retryable: true,
    };
    const pending = {
      ...processingItem,
      id: secondItemId,
      status: 'PENDING' as const,
      leaseToken: null,
      leaseUntil: null,
    };
    const select = createSelect(
      [processingItem],
      [job],
      [{ ...processingItem, status: 'SUCCEEDED' as const }, failed],
    );
    const { update, updates } = createUpdate([{ id: itemId }]);
    const repository = new DrizzleTtsRepository(
      {
        select,
        update,
        transaction: passthroughTransaction({ select, update }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );

    await expect(
      repository.fail({
        item: toWorkItem(),
        errorCode: 'PROVIDER_TIMEOUT',
        retryable: true,
        failedAt: now,
      }),
    ).resolves.toBe(true);
    expect(
      updates.find((entry) => entry.table === ttsJobs)?.values,
    ).toMatchObject({
      status: 'PARTIALLY_FAILED',
      succeededCount: 1,
      failedCount: 1,
    });

    const nextSelect = createSelect(
      [pending],
      [job],
      [
        {
          ...pending,
          status: 'PROCESSING' as const,
          leaseToken: 'next',
          leaseUntil: new Date('2026-07-27T05:05:00.000Z'),
        },
      ],
    );
    const nextUpdate = createUpdate([{ id: secondItemId }]).update;
    const nextRepository = new DrizzleTtsRepository(
      {
        select: nextSelect,
        update: nextUpdate,
        transaction: passthroughTransaction({
          select: nextSelect,
          update: nextUpdate,
        }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );

    await expect(nextRepository.claimNext(jobId, now)).resolves.toMatchObject({
      itemId: secondItemId,
    });
  });

  it('선택한 retryable failed item만 attempt를 증가시킨다', async () => {
    const retryable = {
      ...processingItem,
      status: 'FAILED' as const,
      retryable: true,
      leaseToken: null,
      leaseUntil: null,
      attempt: 2,
    };
    const select = createSelect(
      [retryable],
      [job],
      [
        {
          ...retryable,
          status: 'PENDING' as const,
          retryable: false,
          attempt: 3,
        },
      ],
    );
    const { update, updates } = createUpdate();
    const repository = new DrizzleTtsRepository(
      {
        select,
        update,
        transaction: passthroughTransaction({ select, update }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );

    await expect(
      repository.retry({
        jobId,
        itemIds: [itemId],
        expectedAttempts: { [itemId]: 2 },
        requestedAt: now,
      }),
    ).resolves.toBe(1);
    expect(
      updates.find((entry) => entry.table === ttsItems)?.values,
    ).toMatchObject({
      status: 'PENDING',
      attempt: 3,
      retryable: false,
    });
  });

  it('job row를 잠근 뒤 item 상태를 읽어 최종 집계를 저장한다', async () => {
    const sources: unknown[] = [];
    const results = [
      [processingItem],
      [job],
      [{ ...processingItem, status: 'FAILED' as const, retryable: true }],
    ];
    const select = vi.fn(() => {
      const chain = selectChain(results.shift() ?? []);
      chain.from.mockImplementation((table: unknown) => {
        sources.push(table);
        return chain;
      });
      return chain;
    });
    const { update } = createUpdate([{ id: itemId }]);
    const repository = new DrizzleTtsRepository(
      {
        select,
        update,
        transaction: passthroughTransaction({ select, update }),
      } as never,
      { attach: async () => 'ATTACHED' },
    );

    await repository.fail({
      item: toWorkItem(),
      errorCode: 'PROVIDER_TIMEOUT',
      retryable: true,
      failedAt: now,
    });

    expect(sources).toEqual([ttsItems, ttsJobs, ttsItems]);
  });
});
