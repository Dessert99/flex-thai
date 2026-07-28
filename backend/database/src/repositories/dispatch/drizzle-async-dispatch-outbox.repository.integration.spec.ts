/** 실제 PostgreSQL에서 공유 outbox의 transaction·동시 claim·lease redelivery를 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAsyncDispatchOutboxRepository } from './drizzle-async-dispatch-outbox.repository.js';

const databaseUrl = process.env.ASYNC_DISPATCH_OUTBOX_TEST_DATABASE_URL;

describe.runIf(databaseUrl !== undefined)(
  '공유 dispatch outbox PostgreSQL lease',
  () => {
    let pool: Pool;
    const createdJobIds: string[] = [];

    beforeAll(async () => {
      if (!databaseUrl)
        throw new Error('ASYNC_DISPATCH_OUTBOX_TEST_DATABASE_URL_REQUIRED');
      pool = new Pool({ connectionString: databaseUrl });
      const migration = await pool.query<{ name: string | null }>(
        `select to_regclass('async_dispatch_outbox')::text as name`,
      );
      if (!migration.rows[0]?.name) {
        throw new Error(
          'Wave 5 outbox migration이 적용된 격리 DB가 필요합니다.',
        );
      }
    });

    afterEach(async () => {
      if (createdJobIds.length === 0) return;
      await pool.query(
        `delete from async_dispatch_outbox where job_id = any($1::uuid[])`,
        [createdJobIds.splice(0)],
      );
    });

    afterAll(async () => {
      await pool.end();
    });

    const enqueueTts = async (
      repository: DrizzleAsyncDispatchOutboxRepository,
      database: ReturnType<typeof drizzle>,
      jobId = randomUUID(),
      attempt = 0,
    ) => {
      createdJobIds.push(jobId);
      await database.transaction((transaction) =>
        repository.enqueueTts(transaction as never, {
          jobId,
          attempt,
          commandFingerprint: 'a'.repeat(64),
          requestedAt: new Date('2026-07-28T00:00:00.000Z'),
        }),
      );
      return jobId;
    };

    it('호출 transaction이 rollback되면 outbox intent도 남지 않는다', async () => {
      const database = drizzle({ client: pool });
      const repository = new DrizzleAsyncDispatchOutboxRepository(
        database as never,
      );
      const jobId = randomUUID();
      createdJobIds.push(jobId);

      await expect(
        database.transaction(async (transaction) => {
          await repository.enqueueTts(transaction as never, {
            jobId,
            attempt: 0,
            commandFingerprint: 'a'.repeat(64),
            requestedAt: new Date('2026-07-28T00:00:00.000Z'),
          });
          throw new Error('ROLLBACK');
        }),
      ).rejects.toThrow('ROLLBACK');
      const count = await pool.query<{ count: string }>(
        `select count(*)::text count
         from async_dispatch_outbox
         where job_id = $1`,
        [jobId],
      );
      expect(count.rows[0]?.count).toBe('0');
    });

    it('두 relay의 동시 claim은 같은 row를 함께 소유하지 않는다', async () => {
      const database = drizzle({ client: pool });
      let clock = new Date('2026-07-28T00:00:00.000Z');
      const first = new DrizzleAsyncDispatchOutboxRepository(
        database as never,
        () => clock,
        () => 'lease-a',
      );
      const second = new DrizzleAsyncDispatchOutboxRepository(
        database as never,
        () => clock,
        () => 'lease-b',
      );
      await enqueueTts(first, database);

      const results = await Promise.all([
        first.claimBatch({
          workerId: 'worker-a',
          batchSize: 1,
          leaseDurationMs: 60_000,
        }),
        second.claimBatch({
          workerId: 'worker-b',
          batchSize: 1,
          leaseDurationMs: 60_000,
        }),
      ]);

      expect(results.map(({ length }) => length).sort()).toEqual([0, 1]);
      expect(results.flat()).toHaveLength(1);
      clock = new Date('2026-07-28T00:00:01.000Z');
    });

    it('lease 만료 뒤 새 owner가 reclaim하면 이전 owner의 ack와 release를 거부한다', async () => {
      const database = drizzle({ client: pool });
      let clock = new Date('2026-07-28T00:00:00.000Z');
      let lease = 'lease-a';
      const repository = new DrizzleAsyncDispatchOutboxRepository(
        database as never,
        () => clock,
        () => lease,
      );
      await enqueueTts(repository, database);
      const [first] = await repository.claimBatch({
        workerId: 'worker-a',
        batchSize: 1,
        leaseDurationMs: 1_000,
      });
      clock = new Date('2026-07-28T00:00:02.000Z');
      lease = 'lease-b';
      const [reclaimed] = await repository.claimBatch({
        workerId: 'worker-b',
        batchSize: 1,
        leaseDurationMs: 1_000,
      });

      await expect(
        repository.acknowledge({
          id: first!.id,
          leaseOwner: first!.leaseOwner,
          deliveredAt: clock,
        }),
      ).resolves.toBe(false);
      await expect(
        repository.release({
          id: first!.id,
          leaseOwner: first!.leaseOwner,
          failedAt: clock,
          nextAvailableAt: clock,
          errorCode: 'ASYNC_DISPATCH_SEND_FAILED',
        }),
      ).resolves.toBe(false);
      expect(reclaimed?.leaseOwner).toBe('worker-b:lease-b');
    });

    it('release 전에는 재claim되지 않고 다음 availableAt부터 같은 identity로 redelivery된다', async () => {
      const database = drizzle({ client: pool });
      let clock = new Date('2026-07-28T00:00:00.000Z');
      let lease = 'lease-a';
      const repository = new DrizzleAsyncDispatchOutboxRepository(
        database as never,
        () => clock,
        () => lease,
      );
      await enqueueTts(repository, database);
      const [claimed] = await repository.claimBatch({
        workerId: 'worker-a',
        batchSize: 1,
        leaseDurationMs: 60_000,
      });
      const availableAt = new Date('2026-07-28T00:00:30.000Z');
      await repository.release({
        id: claimed!.id,
        leaseOwner: claimed!.leaseOwner,
        failedAt: clock,
        nextAvailableAt: availableAt,
        errorCode: 'ASYNC_DISPATCH_SEND_FAILED',
      });

      clock = new Date('2026-07-28T00:00:29.999Z');
      await expect(
        repository.claimBatch({
          workerId: 'worker-b',
          batchSize: 1,
          leaseDurationMs: 60_000,
        }),
      ).resolves.toEqual([]);
      clock = availableAt;
      lease = 'lease-b';
      const [redelivered] = await repository.claimBatch({
        workerId: 'worker-b',
        batchSize: 1,
        leaseDurationMs: 60_000,
      });
      expect(redelivered).toMatchObject({
        id: claimed!.id,
        idempotencyKey: claimed!.idempotencyKey,
        deliveryAttempts: 2,
      });
    });

    it('활성 lease ack만 deliveredAt을 닫고 다시 claim되지 않는다', async () => {
      const database = drizzle({ client: pool });
      const clock = new Date('2026-07-28T00:00:00.000Z');
      const repository = new DrizzleAsyncDispatchOutboxRepository(
        database as never,
        () => clock,
        () => 'lease-a',
      );
      await enqueueTts(repository, database);
      const [claimed] = await repository.claimBatch({
        workerId: 'worker-a',
        batchSize: 1,
        leaseDurationMs: 60_000,
      });

      await expect(
        repository.acknowledge({
          id: claimed!.id,
          leaseOwner: claimed!.leaseOwner,
          deliveredAt: clock,
        }),
      ).resolves.toBe(true);
      await expect(
        repository.claimBatch({
          workerId: 'worker-b',
          batchSize: 1,
          leaseDurationMs: 60_000,
        }),
      ).resolves.toEqual([]);
    });
  },
);
