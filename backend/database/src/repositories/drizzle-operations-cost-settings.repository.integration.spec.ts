/** 실제 PostgreSQL에서 비용 설정 singleton의 CAS·replay·감사 원자성을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleOperationsCostSettingsRepository } from './drizzle-operations-cost-settings.repository.js';

const databaseUrl = process.env.OPERATIONS_COST_SETTINGS_TEST_DATABASE_URL;
const baseUpdatedAt = new Date('2077-02-01T00:00:00.000Z');

interface StoredSettings {
  currency: string;
  warningUsd: string;
  criticalUsd: string;
  updatedAt: Date;
  updatedBy: string | null;
  lastRequestId: string | null;
  lastRequestFingerprint: string | null;
}

const readStoredSettings = async (pool: Pool) => {
  const result = await pool.query<StoredSettings>(
    `select
       currency,
       warning_usd "warningUsd",
       critical_usd "criticalUsd",
       updated_at "updatedAt",
       updated_by "updatedBy",
       last_request_id "lastRequestId",
       last_request_fingerprint "lastRequestFingerprint"
     from operations_cost_settings where id = 1`,
  );
  const [settings] = result.rows;
  if (!settings) throw new Error('OPERATIONS_COST_SETTINGS_FIXTURE_MISSING');
  return settings;
};

const restoreSettings = async (pool: Pool, settings: StoredSettings) => {
  await pool.query(
    `update operations_cost_settings
     set currency = $1,
         warning_usd = $2,
         critical_usd = $3,
         updated_at = $4,
         updated_by = $5,
         last_request_id = $6,
         last_request_fingerprint = $7
     where id = 1`,
    [
      settings.currency,
      settings.warningUsd,
      settings.criticalUsd,
      settings.updatedAt,
      settings.updatedBy,
      settings.lastRequestId,
      settings.lastRequestFingerprint,
    ],
  );
};

const withSettingsFixture = async <Result>(
  pool: Pool,
  run: (fixture: {
    actor: { userId: string; sub: string };
    repository: DrizzleOperationsCostSettingsRepository;
  }) => Promise<Result>,
) => {
  const original = await readStoredSettings(pool);
  const actor = {
    userId: randomUUID(),
    sub: `cost-settings-${randomUUID()}`,
  };
  await pool.query(
    `insert into users (id, cognito_sub, email, role, status)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
    [actor.userId, actor.sub, `${actor.sub}@example.com`],
  );
  await pool.query(
    `update operations_cost_settings
     set warning_usd = '15.000000',
         critical_usd = '24.000000',
         updated_at = $1,
         updated_by = null,
         last_request_id = null,
         last_request_fingerprint = null
     where id = 1`,
    [baseUpdatedAt],
  );
  const repository = new DrizzleOperationsCostSettingsRepository(
    drizzle({ client: pool }) as never,
  );
  try {
    return await run({ actor, repository });
  } finally {
    await restoreSettings(pool, original);
    await pool.query('delete from audit_logs where actor_user_id = $1', [
      actor.userId,
    ]);
    await pool.query('delete from users where id = $1', [actor.userId]);
  }
};

const expectRejectedAudit = async (operation: Promise<unknown>) => {
  const failure = await operation.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error) || !(failure.cause instanceof Error)) {
    throw new Error('COST_SETTINGS_AUDIT_FAILURE_CAUSE_REQUIRED');
  }
  expect(failure.cause.message).toContain('AUDIT_TRIGGER_FAILED');
};

describe.runIf(databaseUrl !== undefined)(
  '비용 설정 PostgreSQL CAS와 감사 원자성',
  () => {
    let pool: Pool;

    beforeAll(() => {
      if (!databaseUrl) {
        throw new Error('OPERATIONS_COST_SETTINGS_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: databaseUrl });
    });

    afterAll(async () => {
      await pool.end();
    });

    it('migration은 singleton row와 check·사용자 FK를 준비한다', async () => {
      const constraints = await pool.query<{ name: string; type: string }>(
        `select conname name, contype type
         from pg_constraint
         where conrelid = 'operations_cost_settings'::regclass
         order by conname`,
      );
      expect(constraints.rows).toEqual([
        { name: 'operations_cost_settings_currency_usd', type: 'c' },
        { name: 'operations_cost_settings_pkey', type: 'p' },
        { name: 'operations_cost_settings_singleton', type: 'c' },
        { name: 'operations_cost_settings_threshold_order', type: 'c' },
        {
          name: 'operations_cost_settings_updated_by_users_id_fk',
          type: 'f',
        },
      ]);
      await expect(
        pool.query(
          `insert into operations_cost_settings (
             id, currency, warning_usd, critical_usd
           ) values (2, 'USD', '15.000000', '24.000000')`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(
          'update operations_cost_settings set updated_by = $1 where id = 1',
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        pool.query(
          `update operations_cost_settings set currency = 'THB' where id = 1`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(
          `update operations_cost_settings
           set warning_usd = '0.000000' where id = 1`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(
          `update operations_cost_settings
           set warning_usd = critical_usd where id = 1`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const singleton = await pool.query<{ count: number }>(
        'select count(*)::int count from operations_cost_settings',
      );
      expect(singleton.rows[0]?.count).toBe(1);
    });

    it('update를 한 번 감사하고 같은 요청은 replay하며 stale·재사용은 거절한다', async () => {
      await withSettingsFixture(pool, async ({ actor, repository }) => {
        const requestId = randomUUID();
        const input = {
          warningUsd: '16.000000',
          criticalUsd: '25.000000',
          expectedUpdatedAt: baseUpdatedAt,
          requestId,
          requestFingerprint: 'settings-v1',
          actor,
          changedAt: new Date('2077-02-01T01:00:00.000Z'),
        };

        await expect(repository.update(input)).resolves.toMatchObject({
          kind: 'UPDATED',
          settings: {
            warningUsd: '16.000000',
            criticalUsd: '25.000000',
          },
        });
        await expect(repository.update(input)).resolves.toMatchObject({
          kind: 'REPLAY',
        });
        await expect(
          repository.update({
            ...input,
            requestId: randomUUID(),
            requestFingerprint: 'stale',
          }),
        ).resolves.toEqual({ kind: 'CONFLICT' });
        await expect(
          repository.update({
            ...input,
            requestFingerprint: 'reused-with-different-payload',
            expectedUpdatedAt: input.changedAt,
          }),
        ).resolves.toEqual({ kind: 'CONFLICT' });

        const audits = await pool.query<{
          count: number;
          summary: Record<string, unknown>;
        }>(
          `select count(*)::int count, max(summary::text)::jsonb summary
           from audit_logs
           where actor_user_id = $1
             and action = 'USAGE_COST_SETTINGS_UPDATED'
           group by actor_user_id`,
          [actor.userId],
        );
        expect(audits.rows).toHaveLength(1);
        expect(audits.rows[0]).toMatchObject({
          count: 1,
          summary: {
            before: {
              warningUsd: '15.000000',
              criticalUsd: '24.000000',
            },
            after: {
              warningUsd: '16.000000',
              criticalUsd: '25.000000',
            },
            currency: 'USD',
          },
        });
      });
    });

    it('같은 revision의 동시 update는 정확히 하나만 commit한다', async () => {
      await withSettingsFixture(pool, async ({ actor, repository }) => {
        const update = (
          requestId: string,
          fingerprint: string,
          warningUsd: string,
          criticalUsd: string,
        ) =>
          repository.update({
            warningUsd,
            criticalUsd,
            expectedUpdatedAt: baseUpdatedAt,
            requestId,
            requestFingerprint: fingerprint,
            actor,
            changedAt: new Date('2077-02-01T02:00:00.000Z'),
          });

        const results = await Promise.all([
          update(randomUUID(), 'concurrent-a', '17.000000', '26.000000'),
          update(randomUUID(), 'concurrent-b', '18.000000', '27.000000'),
        ]);
        expect(results.filter(({ kind }) => kind === 'UPDATED')).toHaveLength(
          1,
        );
        expect(results.filter(({ kind }) => kind === 'CONFLICT')).toHaveLength(
          1,
        );
        const audit = await pool.query<{ count: number }>(
          `select count(*)::int count from audit_logs
           where actor_user_id = $1
             and action = 'USAGE_COST_SETTINGS_UPDATED'`,
          [actor.userId],
        );
        expect(audit.rows[0]?.count).toBe(1);
      });
    });

    it('audit insert 실패는 singleton 변경과 request 기록을 rollback한다', async () => {
      await withSettingsFixture(pool, async ({ actor, repository }) => {
        const requestId = randomUUID();
        const suffix = requestId.replaceAll('-', '');
        const functionName = `reject_cost_settings_audit_${suffix}`;
        const triggerName = `reject_cost_settings_audit_trigger_${suffix}`;
        await pool.query(`
          create function "${functionName}"() returns trigger language plpgsql
          as $$
          begin
            if new.request_id = '${requestId}' then
              raise exception 'AUDIT_TRIGGER_FAILED';
            end if;
            return new;
          end
          $$`);
        await pool.query(`
          create trigger "${triggerName}"
          before insert on audit_logs
          for each row execute function "${functionName}"()`);
        try {
          await expectRejectedAudit(
            repository.update({
              warningUsd: '19.000000',
              criticalUsd: '28.000000',
              expectedUpdatedAt: baseUpdatedAt,
              requestId,
              requestFingerprint: 'rollback',
              actor,
              changedAt: new Date('2077-02-01T03:00:00.000Z'),
            }),
          );
        } finally {
          await pool.query(
            `drop trigger if exists "${triggerName}" on audit_logs`,
          );
          await pool.query(`drop function if exists "${functionName}"()`);
        }

        const stored = await readStoredSettings(pool);
        expect(stored).toMatchObject({
          warningUsd: '15.000000',
          criticalUsd: '24.000000',
          updatedAt: baseUpdatedAt,
          updatedBy: null,
          lastRequestId: null,
          lastRequestFingerprint: null,
        });
        const audit = await pool.query<{ count: number }>(
          'select count(*)::int count from audit_logs where request_id = $1',
          [requestId],
        );
        expect(audit.rows[0]?.count).toBe(0);
      });
    });
  },
);
