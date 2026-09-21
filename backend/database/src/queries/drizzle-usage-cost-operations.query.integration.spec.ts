/** 실제 PostgreSQL에서 AI 비용 과 운영 aggregate를 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleUsageCostOperationsQuery } from './drizzle-usage-cost-operations.query.js';

const databaseUrl = process.env.USAGE_COST_TEST_DATABASE_URL;

const createFixture = async (pool: Pool) => {
  const ids = {
    user: randomUUID(),
    job: randomUUID(),
    upload: randomUUID(),
    input: randomUUID(),
    item: randomUUID(),
    aiRun: randomUUID(),
  };
  const provider = `cost-${ids.user}`;
  const occurredAt = new Date(
    Date.UTC(2077, 0, 1) + Number.parseInt(ids.user.slice(0, 8), 16),
  );
  const range = {
    from: new Date(occurredAt.getTime() - 1),
    to: new Date(occurredAt.getTime() + 1),
  };
  await pool.query(
    `insert into users (id, cognito_sub, email, role, status)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
    [ids.user, provider, `${provider}@example.com`],
  );
  await pool.query(
    `insert into jobs (
       id, requested_by, client_request_id, type, status, created_at, updated_at
     ) values ($1, $2, $3, 'VOCABULARY_EXTRACTION', 'RUNNING', $4, $4)`,
    [ids.job, ids.user, randomUUID(), occurredAt],
  );
  await pool.query(
    `insert into uploads (
       id, owner_id, input_type, object_key, declared_content_type, status,
       created_at
     ) values ($1, $2, 'TEXT', $3, 'text/plain', 'VERIFIED', $4)`,
    [ids.upload, ids.user, `cost/${ids.upload}.txt`, occurredAt],
  );
  await pool.query(
    `insert into job_inputs (id, job_id, upload_id, ordinal, created_at)
     values ($1, $2, $3, 0, $4)`,
    [ids.input, ids.job, ids.upload, occurredAt],
  );
  await pool.query(
    `insert into job_items (
       id, job_id, job_input_id, operation, status, attempt, created_at,
       updated_at
     ) values ($1, $2, $3, 'VOCABULARY_EXTRACTION', 'PROCESSING', 1, $4, $4)`,
    [ids.item, ids.job, ids.input, occurredAt],
  );
  await pool.query(
    `insert into provider_runs (
       id, job_item_id, operation, provider, model, attempt, status,
       estimated_cost_usd, success, started_at, finished_at
     ) values (
       $1, $2, 'VOCABULARY_EXTRACTION', $3, 'cost-v1', 1, 'SUCCEEDED',
       '1.125000', true, $4, $4
     )`,
    [ids.aiRun, ids.item, provider, occurredAt],
  );

  return { ids, provider, range };
};

const removeFixture = async (
  pool: Pool,
  fixture: Awaited<ReturnType<typeof createFixture>>,
) => {
  await pool.query('delete from provider_runs where id = $1', [
    fixture.ids.aiRun,
  ]);

  await pool.query('delete from job_items where id = $1', [fixture.ids.item]);
  await pool.query('delete from job_inputs where id = $1', [fixture.ids.input]);
  await pool.query('delete from uploads where id = $1', [fixture.ids.upload]);
  await pool.query('delete from jobs where id = $1', [fixture.ids.job]);
  await pool.query('delete from users where id = $1', [fixture.ids.user]);
};

describe.runIf(databaseUrl !== undefined)(
  '사용량·비용 PostgreSQL  집계',
  () => {
    let pool: Pool;

    beforeAll(() => {
      if (!databaseUrl)
        throw new Error('USAGE_COST_TEST_DATABASE_URL_REQUIRED');
      pool = new Pool({ connectionString: databaseUrl });
    });

    afterAll(async () => {
      await pool.end();
    });

    it('AI run을 소수 정밀도를 보존한 breakdown으로 합친다', async () => {
      const fixture = await createFixture(pool);
      const query = new DrizzleUsageCostOperationsQuery(
        drizzle({ client: pool }),
      );
      try {
        await expect(
          query.getOverview({ range: fixture.range }),
        ).resolves.toEqual({
          estimatedCostUsd: '1.125000',
          inProgressJobCount: 1,
          failedRunCount: 0,
          pendingReviewCandidateCount: 0,
          breakdown: [
            {
              source: 'AI',
              provider: fixture.provider,
              model: 'cost-v1',
              runCount: 1,
              estimatedCostUsd: '1.125000',
            },
          ],
        });
        await expect(
          query.getCurrentMonthEstimatedCost(fixture.range),
        ).resolves.toBe('1.125000');
      } finally {
        await removeFixture(pool, fixture);
      }
    });
  },
);
