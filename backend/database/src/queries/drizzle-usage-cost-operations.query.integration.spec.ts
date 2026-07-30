/** 실제 PostgreSQL에서 AI·TTS 비용 UNION과 운영 aggregate를 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleUsageCostOperationsQuery } from './drizzle-usage-cost-operations.query.js';

const databaseUrl = process.env.USAGE_COST_TEST_DATABASE_URL;

const voiceSnapshot = {
  presetId: '00000000-0000-4000-8000-000000000001',
  provider: 'integration',
  model: 'cost-v1',
  voice: 'thai-cost',
  locale: 'th-TH',
  audioFormat: 'audio/wav',
  generationRevision: 'r1',
};

const createFixture = async (pool: Pool) => {
  const ids = {
    user: randomUUID(),
    job: randomUUID(),
    upload: randomUUID(),
    input: randomUUID(),
    item: randomUUID(),
    aiRun: randomUUID(),
    ttsJob: randomUUID(),
    ttsItem: randomUUID(),
    ttsRun: randomUUID(),
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
     ) values ($1, $2, $3, 'QUESTION_GENERATION', 'RUNNING', $4, $4)`,
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
     ) values ($1, $2, $3, 'QUESTION_GENERATION', 'PROCESSING', 1, $4, $4)`,
    [ids.item, ids.job, ids.input, occurredAt],
  );
  await pool.query(
    `insert into provider_runs (
       id, job_item_id, operation, provider, model, attempt, status,
       estimated_cost_usd, success, started_at, finished_at
     ) values (
       $1, $2, 'QUESTION_GENERATION', $3, 'cost-v1', 1, 'SUCCEEDED',
       '1.125000', true, $4, $4
     )`,
    [ids.aiRun, ids.item, provider, occurredAt],
  );
  await pool.query(
    `insert into tts_jobs (
       id, requested_by, voice_snapshot, status, pending_count, created_at,
       updated_at
     ) values ($1, $2, $3::jsonb, 'QUEUED', 1, $4, $4)`,
    [ids.ttsJob, ids.user, JSON.stringify(voiceSnapshot), occurredAt],
  );
  await pool.query(
    `insert into tts_items (
       id, job_id, target_kind, target_id, target_text, target_required,
       revision, voice_snapshot, cache_key, status, attempt, created_at,
       updated_at
     ) values (
       $1, $2, 'THAI_SENTENCE_VERSION', $3, 'สวัสดี', true, 'r1',
       $4::jsonb, $5, 'FAILED', 1, $6, $6
     )`,
    [
      ids.ttsItem,
      ids.ttsJob,
      randomUUID(),
      JSON.stringify(voiceSnapshot),
      `cost-${ids.ttsItem}`,
      occurredAt,
    ],
  );
  await pool.query(
    `insert into tts_provider_runs (
       id, item_id, attempt, cache_key, cache_claim_token, item_lease_token,
       provider, model, status, estimated_cost_usd, error_code, retryable,
       started_at, finished_at
     ) values (
       $1, $2, 1, $3, 'claim', 'lease', $4, 'cost-v1', 'FAILED',
       '0.37500000', 'PROVIDER_FAILED', false, $5, $5
     )`,
    [ids.ttsRun, ids.ttsItem, `cost-${ids.ttsItem}`, provider, occurredAt],
  );
  return { ids, provider, range };
};

const addFilterDecoys = async (
  pool: Pool,
  fixture: Awaited<ReturnType<typeof createFixture>>,
) => {
  const occurredAt = new Date(fixture.range.from.getTime() + 1);
  const outsideAt = new Date(fixture.range.to.getTime() + 86_400_000);
  const otherVoiceSnapshot = { ...voiceSnapshot, voice: 'thai-other' };
  const otherVoiceItemId = randomUUID();
  await pool.query(
    `insert into tts_provider_runs (
       id, item_id, attempt, cache_key, cache_claim_token, item_lease_token,
       provider, model, status, estimated_cost_usd, error_code, retryable,
       started_at, finished_at
     ) values
       ($1, $2, 2, $3, 'claim-2', 'lease-2', $4, 'cost-v1', 'FAILED',
        '0.50000000', 'PROVIDER_FAILED', false, $5, $5),
       ($6, $2, 3, $3, 'claim-3', 'lease-3', $7, 'cost-other', 'FAILED',
        '0.50000000', 'PROVIDER_FAILED', false, $5, $5),
       ($8, $2, 5, $3, 'claim-5', 'lease-5', $7, 'cost-v1', 'FAILED',
        '0.50000000', 'PROVIDER_FAILED', false, $9, $9)`,
    [
      randomUUID(),
      fixture.ids.ttsItem,
      `cost-${fixture.ids.ttsItem}`,
      `${fixture.provider}-other`,
      occurredAt,
      randomUUID(),
      fixture.provider,
      randomUUID(),
      outsideAt,
    ],
  );
  await pool.query(
    `insert into tts_provider_runs (
       id, item_id, attempt, cache_key, cache_claim_token, item_lease_token,
       provider, model, status, estimated_cost_usd, retryable, started_at
     ) values (
       $1, $2, 4, $3, 'claim-4', 'lease-4', $4, 'cost-v1', 'STARTED',
       '0.50000000', false, $5
     )`,
    [
      randomUUID(),
      fixture.ids.ttsItem,
      `cost-${fixture.ids.ttsItem}`,
      fixture.provider,
      occurredAt,
    ],
  );
  await pool.query(
    `insert into tts_items (
       id, job_id, target_kind, target_id, target_text, target_required,
       revision, voice_snapshot, cache_key, status, attempt, created_at,
       updated_at
     ) values (
       $1, $2, 'THAI_SENTENCE_VERSION', $3, 'ขอบคุณ', true, 'r1',
       $4::jsonb, $5, 'FAILED', 1, $6, $6
     )`,
    [
      otherVoiceItemId,
      fixture.ids.ttsJob,
      randomUUID(),
      JSON.stringify(otherVoiceSnapshot),
      `cost-${otherVoiceItemId}`,
      occurredAt,
    ],
  );
  await pool.query(
    `insert into tts_provider_runs (
       id, item_id, attempt, cache_key, cache_claim_token, item_lease_token,
       provider, model, status, estimated_cost_usd, error_code, retryable,
       started_at, finished_at
     ) values (
       $1, $2, 1, $3, 'claim-voice', 'lease-voice', $4, 'cost-v1', 'FAILED',
       '0.50000000', 'PROVIDER_FAILED', false, $5, $5
     )`,
    [
      randomUUID(),
      otherVoiceItemId,
      `cost-${otherVoiceItemId}`,
      fixture.provider,
      occurredAt,
    ],
  );
};

const removeFixture = async (
  pool: Pool,
  fixture: Awaited<ReturnType<typeof createFixture>>,
) => {
  await pool.query(
    `delete from tts_provider_runs
     where item_id in (select id from tts_items where job_id = $1)`,
    [fixture.ids.ttsJob],
  );
  await pool.query('delete from provider_runs where id = $1', [
    fixture.ids.aiRun,
  ]);
  await pool.query('delete from tts_items where job_id = $1', [
    fixture.ids.ttsJob,
  ]);
  await pool.query('delete from tts_jobs where id = $1', [fixture.ids.ttsJob]);
  await pool.query('delete from job_items where id = $1', [fixture.ids.item]);
  await pool.query('delete from job_inputs where id = $1', [fixture.ids.input]);
  await pool.query('delete from uploads where id = $1', [fixture.ids.upload]);
  await pool.query('delete from jobs where id = $1', [fixture.ids.job]);
  await pool.query('delete from users where id = $1', [fixture.ids.user]);
};

describe.runIf(databaseUrl !== undefined)(
  '사용량·비용 PostgreSQL UNION 집계',
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

    it('AI·TTS run을 소수 정밀도를 보존한 breakdown으로 합친다', async () => {
      const fixture = await createFixture(pool);
      const query = new DrizzleUsageCostOperationsQuery(
        drizzle({ client: pool }),
      );
      try {
        await expect(
          query.getOverview({ range: fixture.range }),
        ).resolves.toEqual({
          estimatedCostUsd: '1.50000000',
          inProgressJobCount: 2,
          failedRunCount: 1,
          pendingReviewCandidateCount: 0,
          breakdown: [
            {
              source: 'AI',
              provider: fixture.provider,
              model: 'cost-v1',
              voice: null,
              runCount: 1,
              estimatedCostUsd: '1.125000',
            },
            {
              source: 'TTS',
              provider: fixture.provider,
              model: 'cost-v1',
              voice: 'thai-cost',
              runCount: 1,
              estimatedCostUsd: '0.37500000',
            },
          ],
        });
        await expect(
          query.getCurrentMonthEstimatedCost(fixture.range),
        ).resolves.toBe('1.50000000');
      } finally {
        await removeFixture(pool, fixture);
      }
    });

    it('source·provider·model·voice·status filter를 같은 UNION에 적용한다', async () => {
      const fixture = await createFixture(pool);
      await addFilterDecoys(pool, fixture);
      const query = new DrizzleUsageCostOperationsQuery(
        drizzle({ client: pool }),
      );
      try {
        const source = await query.getOverview({
          range: fixture.range,
          source: 'TTS',
        });
        expect(source.estimatedCostUsd).toBe('2.37500000');
        expect(
          source.breakdown.every(({ source: value }) => value === 'TTS'),
        ).toBe(true);

        const provider = await query.getOverview({
          range: fixture.range,
          provider: fixture.provider,
        });
        expect(provider.estimatedCostUsd).toBe('3.00000000');
        expect(
          provider.breakdown.every(
            ({ provider: value }) => value === fixture.provider,
          ),
        ).toBe(true);

        const model = await query.getOverview({
          range: fixture.range,
          model: 'cost-v1',
        });
        expect(model.estimatedCostUsd).toBe('3.00000000');
        expect(
          model.breakdown.every(({ model: value }) => value === 'cost-v1'),
        ).toBe(true);

        const voice = await query.getOverview({
          range: fixture.range,
          voice: 'thai-cost',
        });
        expect(voice.estimatedCostUsd).toBe('1.87500000');
        expect(
          voice.breakdown.every(({ voice: value }) => value === 'thai-cost'),
        ).toBe(true);

        const status = await query.getOverview({
          range: fixture.range,
          status: 'FAILED',
        });
        expect(status.estimatedCostUsd).toBe('1.87500000');
        expect(status.failedRunCount).toBe(4);
        await expect(
          query.getCurrentMonthEstimatedCost(fixture.range),
        ).resolves.toBe('3.50000000');
      } finally {
        await removeFixture(pool, fixture);
      }
    });
  },
);
