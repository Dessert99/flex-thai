/** 실제 PostgreSQL에서 TTS retry와 outbox의 commit·rollback·replay를 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAsyncDispatchOutboxRepository } from '../dispatch/drizzle-async-dispatch-outbox.repository.js';
import { DrizzleTtsRetryCoordinator } from './drizzle-tts-retry-coordinator.js';

const databaseUrl =
  process.env.TTS_RETRY_TEST_DATABASE_URL ??
  process.env.TTS_TEST_DATABASE_URL ??
  process.env.WAVE5_TTS_TEST_DATABASE_URL;
const requestedAt = new Date('2026-07-28T01:00:00.000Z');

const voiceSnapshot = {
  presetId: '00000000-0000-4000-8000-000000000001',
  provider: 'LOCAL_FAKE',
  model: 'deterministic-v1',
  voice: 'thai-female',
  locale: 'th-TH',
  audioFormat: 'audio/wav',
  generationRevision: 'v1',
};

const createFixture = async (pool: Pool) => {
  const ids = {
    user: randomUUID(),
    job: randomUUID(),
    item: randomUUID(),
    target: randomUUID(),
    revision: randomUUID(),
    cache: randomUUID(),
  };
  const cacheKey = `retry-${ids.item}`;
  await pool.query(
    `insert into users (id, cognito_sub, email, role, status)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
    [ids.user, `retry-${ids.user}`, `retry-${ids.user}@example.com`],
  );
  await pool.query(
    `insert into tts_jobs (
       id, requested_by, voice_snapshot, status, pending_count,
       processing_count, succeeded_count, failed_count, finished_at
     ) values ($1, $2, $3, 'FAILED', 0, 0, 0, 1, $4)`,
    [ids.job, ids.user, voiceSnapshot, requestedAt],
  );
  await pool.query(
    `insert into tts_items (
       id, job_id, target_kind, target_id, target_text, target_required,
       revision, voice_snapshot, cache_key, status, attempt, error_code,
       retryable
     ) values (
       $1, $2, 'THAI_SENTENCE_VERSION', $3, 'สวัสดี', true, $4, $5, $6,
       'FAILED', 2, 'PROVIDER_TIMEOUT', true
     )`,
    [ids.item, ids.job, ids.target, ids.revision, voiceSnapshot, cacheKey],
  );
  await pool.query(
    `insert into tts_audio_cache (
       id, cache_key, status, generation_attempt, error_code, retryable
     ) values ($1, $2, 'FAILED', 1, 'PROVIDER_TIMEOUT', true)`,
    [ids.cache, cacheKey],
  );
  return { ids, cacheKey };
};

const command = (fixture: Awaited<ReturnType<typeof createFixture>>) => ({
  jobId: fixture.ids.job,
  itemIds: [fixture.ids.item],
  expectedAttempts: { [fixture.ids.item]: 2 },
  requestedAt,
});

describe.runIf(databaseUrl !== undefined)(
  'TTS retry와 outbox PostgreSQL 원자성',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TTS_RETRY_TEST_DATABASE_URL_REQUIRED');
      pool = new Pool({ connectionString: databaseUrl });
      const migration = await pool.query<{
        outbox: string | null;
        ttsItems: string | null;
      }>(
        `select
           to_regclass('async_dispatch_outbox')::text outbox,
           to_regclass('tts_items')::text "ttsItems"`,
      );
      if (!migration.rows[0]?.outbox || !migration.rows[0]?.ttsItems) {
        throw new Error('Wave 5 migration이 적용된 격리 DB가 필요합니다.');
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    const coordinator = () => {
      const database = drizzle({ client: pool }) as never;
      return new DrizzleTtsRetryCoordinator(
        database,
        new DrizzleAsyncDispatchOutboxRepository(database),
      );
    };

    it('동시 같은 command는 attempt와 TTS outbox를 정확히 한 번만 만든다', async () => {
      const fixture = await createFixture(pool);
      await expect(
        Promise.all([
          coordinator().retryAndDispatch(command(fixture)),
          coordinator().retryAndDispatch(command(fixture)),
        ]),
      ).resolves.toEqual([1, 1]);

      const state = await pool.query<{
        attempt: number;
        cacheStatus: string;
        itemStatus: string;
        outboxCount: string;
      }>(
        `select
           ti.attempt,
           ti.status "itemStatus",
           tac.status "cacheStatus",
           (select count(*)::text from async_dispatch_outbox
            where payload_kind = 'TTS' and job_id = $1 and attempt = 1)
             "outboxCount"
         from tts_items ti
         join tts_audio_cache tac on tac.cache_key = ti.cache_key
         where ti.id = $2`,
        [fixture.ids.job, fixture.ids.item],
      );
      expect(state.rows[0]).toEqual({
        attempt: 3,
        cacheStatus: 'PENDING',
        itemStatus: 'PENDING',
        outboxCount: '1',
      });
    });

    it('서로 다른 attempt 이력의 두 item을 각 기대값으로 한 번에 재시도한다', async () => {
      const fixture = await createFixture(pool);
      const secondItemId = randomUUID();
      const secondTargetId = randomUUID();
      const secondRevision = randomUUID();
      const secondCacheId = randomUUID();
      const secondCacheKey = `retry-${secondItemId}`;
      await pool.query(
        `insert into tts_items (
           id, job_id, target_kind, target_id, target_text, target_required,
           revision, voice_snapshot, cache_key, status, attempt, error_code,
           retryable
         ) values (
           $1, $2, 'THAI_SENTENCE_VERSION', $3, 'ขอบคุณ', true, $4, $5, $6,
           'FAILED', 5, 'PROVIDER_TIMEOUT', true
         )`,
        [
          secondItemId,
          fixture.ids.job,
          secondTargetId,
          secondRevision,
          voiceSnapshot,
          secondCacheKey,
        ],
      );
      await pool.query(
        `insert into tts_audio_cache (
           id, cache_key, status, generation_attempt, error_code, retryable
         ) values ($1, $2, 'FAILED', 1, 'PROVIDER_TIMEOUT', true)`,
        [secondCacheId, secondCacheKey],
      );

      await expect(
        coordinator().retryAndDispatch({
          jobId: fixture.ids.job,
          itemIds: [secondItemId, fixture.ids.item],
          expectedAttempts: {
            [fixture.ids.item]: 2,
            [secondItemId]: 5,
          },
          requestedAt,
        }),
      ).resolves.toBe(2);
      const state = await pool.query<{
        attempts: number[];
        commandFingerprint: string;
        dispatchAttempt: number;
        outboxFingerprint: string;
      }>(
        `select
           array_agg(ti.attempt order by ti.id)::int[] attempts,
           tj.dispatch_attempt "dispatchAttempt",
           tj.last_dispatch_command_fingerprint "commandFingerprint",
           ado.payload ->> 'commandFingerprint' "outboxFingerprint"
         from tts_jobs tj
         join tts_items ti on ti.job_id = tj.id
         join async_dispatch_outbox ado
           on ado.job_id = tj.id
          and ado.payload_kind = 'TTS'
          and ado.attempt = tj.dispatch_attempt
         where tj.id = $1
         group by tj.id, ado.id`,
        [fixture.ids.job],
      );
      expect(
        state.rows[0]?.attempts.sort((left, right) => left - right),
      ).toEqual([3, 6]);
      expect(state.rows[0]?.dispatchAttempt).toBe(1);
      expect(state.rows[0]?.commandFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(state.rows[0]?.outboxFingerprint).toBe(
        state.rows[0]?.commandFingerprint,
      );
    });

    it('outbox writer 실패는 item·cache·job 전이를 모두 rollback한다', async () => {
      const fixture = await createFixture(pool);
      const database = drizzle({ client: pool }) as never;
      const failing = new DrizzleTtsRetryCoordinator(database, {
        enqueueTts: () => Promise.reject(new Error('OUTBOX_FAILED')),
        assertTtsDispatch: () => Promise.resolve(),
      });

      await expect(failing.retryAndDispatch(command(fixture))).rejects.toThrow(
        'OUTBOX_FAILED',
      );
      const state = await pool.query<{
        attempt: number;
        cacheStatus: string;
        failedCount: number;
        itemStatus: string;
        jobStatus: string;
        outboxCount: string;
      }>(
        `select
           ti.attempt,
           ti.status "itemStatus",
           tj.status "jobStatus",
           tj.failed_count "failedCount",
           tac.status "cacheStatus",
           (select count(*)::text from async_dispatch_outbox
            where payload_kind = 'TTS' and job_id = $1) "outboxCount"
         from tts_items ti
         join tts_jobs tj on tj.id = ti.job_id
         join tts_audio_cache tac on tac.cache_key = ti.cache_key
         where ti.id = $2`,
        [fixture.ids.job, fixture.ids.item],
      );
      expect(state.rows[0]).toEqual({
        attempt: 2,
        cacheStatus: 'FAILED',
        failedCount: 1,
        itemStatus: 'FAILED',
        jobStatus: 'FAILED',
        outboxCount: '0',
      });
    });
  },
);
