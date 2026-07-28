/** TTS provider 실행과 orphan audio GC의 멱등·lease·참조 직렬화를 검증한다 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Drizzle chain doubles expose any-typed metadata. */
import { describe, expect, it, vi } from 'vitest';
import { mediaAssets } from '../../schema/media.schema.js';
import { ttsProviderRuns } from '../../schema/tts.schema.js';
import {
  DrizzleTtsDurabilityRepository,
  TtsDurabilityError,
} from './drizzle-tts-durability.repository.js';

const now = new Date('2026-07-28T04:00:00.000Z');
const itemId = '00000000-0000-4000-8000-000000000001';
const runId = '00000000-0000-4000-8000-000000000002';
const gcId = '00000000-0000-4000-8000-000000000003';
const storedAudio = {
  storageKey: 'private/tts/cache-key.wav',
  mimeType: 'audio/wav' as const,
  sizeBytes: 204,
  sha256: 'a'.repeat(64),
};

const selectChain = (rows: unknown[]) => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    for: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.for.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
};

const insertChain = (...rows: unknown[][]) => {
  const values = vi.fn(() => ({
    onConflictDoNothing: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve(rows.shift() ?? [])),
    })),
    returning: vi.fn(() => Promise.resolve(rows.shift() ?? [])),
  }));
  return { insert: vi.fn(() => ({ values })), values };
};

const updateChain = (...rows: unknown[][]) => {
  const writes: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const update = vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => {
      writes.push({ table, values });
      return {
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(rows.shift() ?? []),
        })),
      };
    }),
  }));
  return { update, writes };
};

const transactionDatabase = (transaction: Record<string, unknown>) => ({
  ...transaction,
  transaction: vi.fn(
    <T>(work: (value: typeof transaction) => Promise<T>): Promise<T> =>
      work(transaction),
  ),
});

const providerClaim = {
  item: {
    itemId,
    attempt: 2,
    leaseToken: 'item-lease',
  },
  cacheKey: 'cache-key',
  cacheClaimToken: 'cache-claim',
  provider: 'LOCAL_FAKE',
  model: 'deterministic-v1',
  claimedAt: now,
};

describe('TTS provider run 저장소', () => {
  it('활성 item과 cache claim을 확인한 뒤 item attempt당 하나의 STARTED run을 만든다', async () => {
    const itemSelect = selectChain([{ id: itemId }]);
    const cacheSelect = selectChain([{ id: 'cache-id' }]);
    const select = vi
      .fn()
      .mockReturnValueOnce(itemSelect)
      .mockReturnValueOnce(cacheSelect)
      .mockReturnValueOnce(selectChain([]));
    const inserts = insertChain([{ id: runId }]);
    const repository = new DrizzleTtsDurabilityRepository(
      transactionDatabase({ select, insert: inserts.insert }) as never,
    );

    await expect(repository.claimProviderRun(providerClaim)).resolves.toEqual({
      kind: 'CLAIMED',
      runId,
    });
    expect(inserts.values).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId,
        attempt: 2,
        cacheKey: 'cache-key',
        cacheClaimToken: 'cache-claim',
        itemLeaseToken: 'item-lease',
        status: 'STARTED',
      }),
    );
  });

  it('stale item 또는 cache claim은 provider 호출 소유권을 발급하지 않는다', async () => {
    const select = vi.fn(() => selectChain([]));
    const inserts = insertChain([{ id: runId }]);
    const repository = new DrizzleTtsDurabilityRepository(
      transactionDatabase({ select, insert: inserts.insert }) as never,
    );

    await expect(repository.claimProviderRun(providerClaim)).resolves.toEqual({
      kind: 'OUTCOME_UNKNOWN',
      cacheClaimToken: 'cache-claim',
    });
    expect(inserts.insert).not.toHaveBeenCalled();
  });

  it('provider 성공은 usage·비용·request ID와 실제 storage metadata를 STARTED에 한 번만 쓴다', async () => {
    const updates = updateChain([{ id: runId }]);
    const repository = new DrizzleTtsDurabilityRepository({
      update: updates.update,
    } as never);

    await expect(
      repository.succeedProviderRun({
        runId,
        usage: { inputCharacters: 7 },
        estimatedCostUsd: '0.00000100',
        providerRequestId: 'provider-request',
        media: storedAudio,
        finishedAt: now,
      }),
    ).resolves.toBe(true);
    expect(updates.writes).toEqual([
      {
        table: ttsProviderRuns,
        values: expect.objectContaining({
          status: 'SUCCEEDED',
          usage: { inputCharacters: 7 },
          estimatedCostUsd: '0.00000100',
          providerRequestId: 'provider-request',
          storageKey: storedAudio.storageKey,
          storageSha256: storedAudio.sha256,
          finishedAt: now,
        }),
      },
    ]);
  });

  it('provider 실패는 원문 예외 대신 bounded code와 retryability만 terminal로 남긴다', async () => {
    const updates = updateChain([{ id: runId }]);
    const repository = new DrizzleTtsDurabilityRepository({
      update: updates.update,
    } as never);

    await repository.failProviderRun({
      runId,
      status: 'FAILED',
      errorCode: 'provider said secret=token',
      retryable: true,
      finishedAt: now,
    });
    expect(updates.writes[0]?.values).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        errorCode: 'TTS_PROVIDER_FAILED',
        retryable: true,
      }),
    );
  });
});

describe('TTS orphan audio GC 저장소', () => {
  it('storage key와 실제 metadata가 같은 등록만 exact replay로 허용한다', async () => {
    const inserts = insertChain([]);
    const select = vi.fn(() =>
      selectChain([
        {
          id: gcId,
          ...storedAudio,
          status: 'PENDING',
          availableAt: now,
        },
      ]),
    );
    const repository = new DrizzleTtsDurabilityRepository(
      transactionDatabase({ insert: inserts.insert, select }) as never,
    );

    await expect(
      repository.registerAudioGc({
        media: storedAudio,
        registeredAt: now,
      }),
    ).resolves.toBeUndefined();
    await expect(
      repository.registerAudioGc({
        media: { ...storedAudio, sha256: 'b'.repeat(64) },
        registeredAt: now,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<TtsDurabilityError>>({
        code: 'TTS_AUDIO_GC_METADATA_CONFLICT',
      }),
    );
  });

  it('READY media가 생긴 key는 object를 claim하지 않고 REFERENCED terminal로 닫는다', async () => {
    const gcSelect = selectChain([
      {
        id: gcId,
        ...storedAudio,
        status: 'PENDING',
        availableAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        processingAttempts: 0,
      },
    ]);
    const referenceSelect = selectChain([{ id: 'media-id' }]);
    const select = vi
      .fn()
      .mockReturnValueOnce(gcSelect)
      .mockReturnValueOnce(referenceSelect);
    const updates = updateChain([{ id: gcId }]);
    const repository = new DrizzleTtsDurabilityRepository(
      transactionDatabase({ select, update: updates.update }) as never,
      () => now,
      () => 'lease-1',
    );

    await expect(
      repository.claimAudioGcBatch({
        workerId: 'worker-a',
        batchSize: 1,
        leaseDurationMs: 60_000,
      }),
    ).resolves.toEqual([]);
    expect(referenceSelect.from).toHaveBeenCalledWith(mediaAssets);
    expect(updates.writes[0]?.values).toMatchObject({
      status: 'REFERENCED',
      referencedAt: now,
      leaseOwner: null,
    });
  });

  it('참조 없는 key만 PROCESSING lease로 claim하고 stale owner 완료는 거절한다', async () => {
    const gcSelect = selectChain([
      {
        id: gcId,
        ...storedAudio,
        status: 'PENDING',
        availableAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        processingAttempts: 0,
      },
    ]);
    const referenceSelect = selectChain([]);
    const select = vi
      .fn()
      .mockReturnValueOnce(gcSelect)
      .mockReturnValueOnce(referenceSelect);
    const updates = updateChain([
      {
        id: gcId,
        ...storedAudio,
        status: 'PROCESSING',
        leaseOwner: 'worker-a:lease-1',
        leaseExpiresAt: new Date('2026-07-28T04:01:00.000Z'),
        processingAttempts: 1,
      },
    ]);
    const repository = new DrizzleTtsDurabilityRepository(
      transactionDatabase({ select, update: updates.update }) as never,
      () => now,
      () => 'lease-1',
    );

    const [claimed] = await repository.claimAudioGcBatch({
      workerId: 'worker-a',
      batchSize: 1,
      leaseDurationMs: 60_000,
    });
    expect(claimed).toMatchObject({
      id: gcId,
      leaseOwner: 'worker-a:lease-1',
    });
    expect(gcSelect.for).toHaveBeenCalledWith('update', { skipLocked: true });

    const staleUpdates = updateChain([]);
    const staleRepository = new DrizzleTtsDurabilityRepository({
      update: staleUpdates.update,
    } as never);
    await expect(
      staleRepository.acknowledgeAudioDeleted({
        id: gcId,
        leaseOwner: 'old-owner',
        deletedAt: now,
      }),
    ).resolves.toBe(false);
  });

  it('READY commit은 GC row를 잠그고 PENDING만 REFERENCED로 바꾸며 PROCESSING·DELETED를 거절한다', async () => {
    const pendingSelect = vi.fn(() =>
      selectChain([
        {
          id: gcId,
          ...storedAudio,
          status: 'PENDING',
        },
      ]),
    );
    const pendingUpdates = updateChain([{ id: gcId }]);
    const repository = new DrizzleTtsDurabilityRepository({} as never);

    await expect(
      repository.markAudioReferenced(
        {
          select: pendingSelect,
          update: pendingUpdates.update,
        } as never,
        { media: storedAudio, referencedAt: now },
      ),
    ).resolves.toBe('REFERENCED');
    expect(pendingSelect.mock.results[0]?.value.for).toHaveBeenCalledWith(
      'update',
    );

    const deletedSelect = vi.fn(() =>
      selectChain([{ id: gcId, ...storedAudio, status: 'DELETED' }]),
    );
    await expect(
      repository.markAudioReferenced({ select: deletedSelect } as never, {
        media: storedAudio,
        referencedAt: now,
      }),
    ).resolves.toBe('DELETED');
  });
});
