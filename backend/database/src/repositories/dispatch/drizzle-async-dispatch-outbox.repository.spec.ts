/** 공유 dispatch outbox의 exact replay와 lease 소유권 전이를 검증한다 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Drizzle chain double의 호출 인자를 검증한다. */
import { describe, expect, it, vi } from 'vitest';
import { asyncDispatchOutbox } from '../../schema/async-dispatch-outbox.schema.js';
import { jobs } from '../../schema/jobs.schema.js';
import {
  AsyncDispatchOutboxError,
  createTtsInitialCommandFingerprint,
  createTtsRetryCommandFingerprint,
  DrizzleAsyncDispatchOutboxRepository,
} from './drizzle-async-dispatch-outbox.repository.js';

const now = new Date('2026-07-28T00:00:00.000Z');
const jobId = '00000000-0000-4000-8000-000000000001';
const outboxId = '00000000-0000-4000-8000-000000000002';
const commandFingerprint = 'a'.repeat(64);

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

const insertChain = (rows: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(rows);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
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

const stored = {
  id: outboxId,
  payloadKind: 'CONTENT_PRODUCTION' as const,
  jobId,
  attempt: 3,
  idempotencyKey: `content-production:${jobId}:3`,
  payload: { jobId, attempt: 3 },
  availableAt: now,
  leaseOwner: null,
  leaseExpiresAt: null,
  deliveryAttempts: 0,
  deliveredAt: null,
  lastErrorCode: null,
  lastErrorAt: null,
  createdAt: now,
  updatedAt: now,
};

describe('공유 dispatch outbox Drizzle 저장소', () => {
  it('TTS initial과 정렬된 retry 선택·미래 attempt는 서로 다른 identity를 만든다', () => {
    const first = createTtsRetryCommandFingerprint(jobId, {
      itemB: 5,
      itemA: 2,
    });
    const reordered = createTtsRetryCommandFingerprint(jobId, {
      itemA: 2,
      itemB: 5,
    });
    const future = createTtsRetryCommandFingerprint(jobId, {
      itemA: 3,
      itemB: 5,
    });

    expect(first).toBe(reordered);
    expect(first).not.toBe(future);
    expect(first).not.toBe(createTtsInitialCommandFingerprint(jobId));
  });

  it('AI 재생성 실행을 결정적 key와 최소 payload로 같은 transaction에 기록한다', async () => {
    const inserted = { ...stored };
    const chain = insertChain([inserted]);
    const repository = new DrizzleAsyncDispatchOutboxRepository({} as never);
    const transaction = { insert: chain.insert };

    await expect(
      repository.enqueue(transaction as never, {
        destination: 'CONTENT_PRODUCTION',
        jobId,
        attempt: 3,
        requestedAt: now,
      }),
    ).resolves.toBeUndefined();
    expect(chain.insert).toHaveBeenCalledWith(asyncDispatchOutbox);
    expect(chain.values).toHaveBeenCalledWith({
      payloadKind: 'CONTENT_PRODUCTION',
      jobId,
      attempt: 3,
      idempotencyKey: `content-production:${jobId}:3`,
      payload: { jobId, attempt: 3 },
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('같은 key의 기존 row가 payload까지 같을 때만 exact replay로 인정한다', async () => {
    const chain = insertChain([]);
    const select = vi.fn(() => selectChain([{ ...stored }]));
    const repository = new DrizzleAsyncDispatchOutboxRepository({} as never);

    await expect(
      repository.enqueue({ insert: chain.insert, select } as never, {
        destination: 'CONTENT_PRODUCTION',
        jobId,
        attempt: 3,
        requestedAt: now,
      }),
    ).resolves.toBeUndefined();
  });

  it('같은 key의 payload가 다르면 stable idempotency conflict로 실패한다', async () => {
    const chain = insertChain([]);
    const select = vi.fn(() =>
      selectChain([{ ...stored, payload: { jobId, attempt: 4 } }]),
    );
    const repository = new DrizzleAsyncDispatchOutboxRepository({} as never);

    await expect(
      repository.enqueue({ insert: chain.insert, select } as never, {
        destination: 'CONTENT_PRODUCTION',
        jobId,
        attempt: 3,
        requestedAt: now,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AsyncDispatchOutboxError>>({
        code: 'ASYNC_DISPATCH_OUTBOX_IDEMPOTENCY_CONFLICT',
      }),
    );
  });

  it('TTS 실행은 command fingerprint를 payload에 보존하고 exact row를 별도로 확인한다', async () => {
    const ttsStored = {
      ...stored,
      payloadKind: 'TTS' as const,
      attempt: 4,
      idempotencyKey: `tts:${jobId}:4`,
      payload: { jobId, attempt: 4, commandFingerprint },
    };
    const insert = insertChain([ttsStored]);
    const repository = new DrizzleAsyncDispatchOutboxRepository({} as never);

    await expect(
      repository.enqueueTts({ insert: insert.insert } as never, {
        jobId,
        attempt: 4,
        commandFingerprint,
        requestedAt: now,
      }),
    ).resolves.toBeUndefined();
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadKind: 'TTS',
        jobId,
        attempt: 4,
        idempotencyKey: `tts:${jobId}:4`,
        payload: { jobId, attempt: 4, commandFingerprint },
      }),
    );

    const select = vi.fn(() => selectChain([ttsStored]));
    await expect(
      repository.assertTtsDispatch({ select } as never, {
        jobId,
        attempt: 4,
        commandFingerprint,
      }),
    ).resolves.toBeUndefined();
  });

  it('TTS exact row가 없거나 command fingerprint가 다르면 replay를 거부한다', async () => {
    const repository = new DrizzleAsyncDispatchOutboxRepository({} as never);
    const missing = vi.fn(() => selectChain([]));
    await expect(
      repository.assertTtsDispatch({ select: missing } as never, {
        jobId,
        attempt: 4,
        commandFingerprint,
      }),
    ).rejects.toMatchObject({
      code: 'ASYNC_DISPATCH_OUTBOX_IDEMPOTENCY_CONFLICT',
    });

    const mismatch = vi.fn(() =>
      selectChain([
        {
          ...stored,
          payloadKind: 'TTS',
          attempt: 4,
          idempotencyKey: `tts:${jobId}:4`,
          payload: {
            jobId,
            attempt: 4,
            commandFingerprint: 'b'.repeat(64),
          },
        },
      ]),
    );
    await expect(
      repository.assertTtsDispatch({ select: mismatch } as never, {
        jobId,
        attempt: 4,
        commandFingerprint,
      }),
    ).rejects.toMatchObject({
      code: 'ASYNC_DISPATCH_OUTBOX_IDEMPOTENCY_CONFLICT',
    });
  });

  it('claim은 SKIP LOCKED 후보에 매번 새 owner를 발급하고 attempt를 증가시킨다', async () => {
    const selected = selectChain([stored]);
    const updates = updateChain([
      {
        ...stored,
        leaseOwner: 'worker-a:lease-1',
        leaseExpiresAt: new Date('2026-07-28T00:01:00.000Z'),
        deliveryAttempts: 1,
      },
    ]);
    const transaction = {
      select: vi.fn(() => selected),
      update: updates.update,
    };
    const repository = new DrizzleAsyncDispatchOutboxRepository(
      {
        transaction: vi.fn(
          (callback: (value: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as never,
      () => now,
      () => 'lease-1',
    );

    await expect(
      repository.claimBatch({
        workerId: 'worker-a',
        batchSize: 10,
        leaseDurationMs: 60_000,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: outboxId,
        leaseOwner: 'worker-a:lease-1',
        deliveryAttempts: 1,
      }),
    ]);
    expect(selected.for).toHaveBeenCalledWith('update', { skipLocked: true });
    expect(updates.writes[0]).toEqual(
      expect.objectContaining({
        table: asyncDispatchOutbox,
        values: expect.objectContaining({
          leaseOwner: 'worker-a:lease-1',
          leaseExpiresAt: new Date('2026-07-28T00:01:00.000Z'),
        }),
      }),
    );
  });

  it('활성 owner ack는 콘텐츠 job의 enqueuedAt과 outbox 완료를 한 transaction에 기록한다', async () => {
    const selected = selectChain([
      {
        ...stored,
        leaseOwner: 'worker-a:lease-1',
        leaseExpiresAt: new Date('2026-07-28T00:01:00.000Z'),
      },
    ]);
    const updates = updateChain([{ id: jobId }], [{ id: outboxId }]);
    const transaction = {
      select: vi.fn(() => selected),
      update: updates.update,
    };
    const repository = new DrizzleAsyncDispatchOutboxRepository({
      transaction: vi.fn(
        (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as never);

    await expect(
      repository.acknowledge({
        id: outboxId,
        leaseOwner: 'worker-a:lease-1',
        deliveredAt: now,
      }),
    ).resolves.toBe(true);
    expect(updates.writes.map(({ table }) => table)).toEqual([
      jobs,
      asyncDispatchOutbox,
    ]);
    expect(updates.writes[1]?.values).toEqual(
      expect.objectContaining({
        deliveredAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      }),
    );
  });

  it('만료되거나 재claim된 stale owner는 ack하지 못한다', async () => {
    const transaction = {
      select: vi.fn(() => selectChain([])),
      update: vi.fn(),
    };
    const repository = new DrizzleAsyncDispatchOutboxRepository({
      transaction: vi.fn(
        (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as never);

    await expect(
      repository.acknowledge({
        id: outboxId,
        leaseOwner: 'old-owner',
        deliveredAt: now,
      }),
    ).resolves.toBe(false);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('release는 원문 오류 대신 제한된 code와 다음 가용 시각만 저장한다', async () => {
    const updates = updateChain([{ id: outboxId }]);
    const repository = new DrizzleAsyncDispatchOutboxRepository({
      update: updates.update,
    } as never);
    const nextAvailableAt = new Date('2026-07-28T00:00:30.000Z');

    await expect(
      repository.release({
        id: outboxId,
        leaseOwner: 'worker-a:lease-1',
        failedAt: now,
        nextAvailableAt,
        errorCode: 'provider said token=secret',
      }),
    ).resolves.toBe(true);
    expect(updates.writes[0]?.values).toEqual({
      availableAt: nextAvailableAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: 'ASYNC_DISPATCH_FAILED',
      lastErrorAt: now,
      updatedAt: now,
    });
  });
});
