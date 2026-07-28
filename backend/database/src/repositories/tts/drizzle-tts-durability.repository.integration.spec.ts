/** 실제 PostgreSQL에서 TTS provider exact-once와 GC 참조·삭제 경쟁을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../schema/index.js';
import { DrizzleTtsDurabilityRepository } from './drizzle-tts-durability.repository.js';

const databaseUrl = process.env.TTS_DURABILITY_TEST_DATABASE_URL;
const voice = {
  presetId: '00000000-0000-4000-8000-000000000001',
  provider: 'LOCAL_FAKE',
  model: 'deterministic-v1',
  voice: 'thai-female',
  locale: 'th-TH',
  audioFormat: 'audio/wav',
  generationRevision: 'v1',
};
const media = {
  storageKey: `private/tts/gc-${randomUUID()}.wav`,
  mimeType: 'audio/wav' as const,
  sizeBytes: 204,
  sha256: 'a'.repeat(64),
};

describe.runIf(databaseUrl !== undefined)(
  'TTS durability PostgreSQL 동시성',
  () => {
    let pool: Pool;
    const cleanupKeys: string[] = [];
    const cleanupUsers: string[] = [];
    const cleanupSentences: string[] = [];
    const cleanupVocabularies: string[] = [];

    beforeAll(async () => {
      if (!databaseUrl) {
        throw new Error('TTS_DURABILITY_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: databaseUrl });
      const migration = await pool.query<{
        providerRuns: string | null;
        audioGc: string | null;
      }>(
        `select
           to_regclass('tts_provider_runs')::text "providerRuns",
           to_regclass('tts_audio_gc_records')::text "audioGc"`,
      );
      if (!migration.rows[0]?.providerRuns || !migration.rows[0]?.audioGc) {
        throw new Error('Wave 5 TTS durability migration이 필요합니다.');
      }
    });

    afterEach(async () => {
      for (const sentenceId of cleanupSentences.splice(0)) {
        await pool.query(
          `delete from thai_sentence_versions where sentence_id = $1`,
          [sentenceId],
        );
        await pool.query(`delete from thai_sentences where id = $1`, [
          sentenceId,
        ]);
      }
      for (const vocabularyId of cleanupVocabularies.splice(0)) {
        await pool.query(
          `delete from vocabulary_pronunciations where vocabulary_id = $1`,
          [vocabularyId],
        );
        await pool.query(`delete from vocabularies where id = $1`, [
          vocabularyId,
        ]);
      }
      for (const userId of cleanupUsers.splice(0)) {
        await pool.query(
          `delete from tts_provider_runs
           where item_id in (
             select id from tts_items
             where job_id in (select id from tts_jobs where requested_by = $1)
           )`,
          [userId],
        );
        await pool.query(
          `delete from tts_audio_cache
           where cache_key like $1`,
          [`pg-${userId}-%`],
        );
        await pool.query(
          `delete from tts_items
           where job_id in (select id from tts_jobs where requested_by = $1)`,
          [userId],
        );
        await pool.query(`delete from tts_jobs where requested_by = $1`, [
          userId,
        ]);
        await pool.query(`delete from users where id = $1`, [userId]);
      }
      if (cleanupKeys.length > 0) {
        const keys = cleanupKeys.splice(0);
        await pool.query(
          `delete from tts_audio_gc_records where storage_key = any($1::text[])`,
          [keys],
        );
        await pool.query(
          `delete from media_assets where storage_key = any($1::text[])`,
          [keys],
        );
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    const createProviderFixture = async () => {
      const ids = {
        user: randomUUID(),
        job: randomUUID(),
        item: randomUUID(),
        target: randomUUID(),
        cache: randomUUID(),
      };
      cleanupUsers.push(ids.user);
      const leaseUntil = new Date(Date.now() + 60_000);
      const cacheKey = `pg-${ids.user}-${ids.cache}`;
      await pool.query(
        `insert into users (id, cognito_sub, email, role, status)
         values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
        [ids.user, `pg-${ids.user}`, `pg-${ids.user}@example.com`],
      );
      await pool.query(
        `insert into tts_jobs (
           id, requested_by, voice_snapshot, status, processing_count
         ) values ($1, $2, $3::jsonb, 'RUNNING', 1)`,
        [ids.job, ids.user, JSON.stringify(voice)],
      );
      await pool.query(
        `insert into tts_items (
           id, job_id, target_kind, target_id, target_text, target_required,
           revision, voice_snapshot, cache_key, status, attempt, lease_token,
           lease_until
         ) values (
           $1, $2, 'THAI_SENTENCE_VERSION', $3, 'ภาษาไทย', true, 'r1',
           $4::jsonb, $5, 'PROCESSING', 1, 'lease-1', $6
         )`,
        [
          ids.item,
          ids.job,
          ids.target,
          JSON.stringify(voice),
          cacheKey,
          leaseUntil,
        ],
      );
      await pool.query(
        `insert into tts_audio_cache (
           id, cache_key, status, generation_attempt, claim_token, claimed_at
         ) values ($1, $2, 'GENERATING', 1, 'cache-claim', now())`,
        [ids.cache, cacheKey],
      );
      return { ...ids, cacheKey, leaseUntil };
    };

    it('동시 duplicate claim은 item attempt provider run 한 행만 만든다', async () => {
      const fixture = await createProviderFixture();
      const database = drizzle({ client: pool, schema });
      const first = new DrizzleTtsDurabilityRepository(database as never);
      const second = new DrizzleTtsDurabilityRepository(database as never);
      const input = {
        item: {
          itemId: fixture.item,
          attempt: 1,
          leaseToken: 'lease-1',
        },
        cacheKey: fixture.cacheKey,
        cacheClaimToken: 'cache-claim',
        provider: 'LOCAL_FAKE',
        model: 'deterministic-v1',
        claimedAt: new Date(),
      };

      const results = await Promise.all([
        first.claimProviderRun(input),
        second.claimProviderRun(input),
      ]);
      expect(results.filter(({ kind }) => kind === 'CLAIMED')).toHaveLength(1);
      const count = await pool.query<{ count: string }>(
        `select count(*)::text count
         from tts_provider_runs
         where item_id = $1 and attempt = 1`,
        [fixture.item],
      );
      expect(count.rows[0]?.count).toBe('1');
    });

    it('provider terminal 성공·실패 CAS 경쟁은 STARTED run을 한 번만 닫는다', async () => {
      const fixture = await createProviderFixture();
      const repository = new DrizzleTtsDurabilityRepository(
        drizzle({ client: pool, schema }) as never,
      );
      const claimed = await repository.claimProviderRun({
        item: {
          itemId: fixture.item,
          attempt: 1,
          leaseToken: 'lease-1',
        },
        cacheKey: fixture.cacheKey,
        cacheClaimToken: 'cache-claim',
        provider: 'LOCAL_FAKE',
        model: 'deterministic-v1',
        claimedAt: new Date(),
      });
      if (claimed.kind !== 'CLAIMED') throw new Error('CLAIM_REQUIRED');

      const results = await Promise.all([
        repository.succeedProviderRun({
          runId: claimed.runId,
          usage: { inputCharacters: 7 },
          estimatedCostUsd: '0.00000100',
          providerRequestId: 'request-1',
          media: {
            ...media,
            storageKey: `private/tts/runs/${claimed.runId}.wav`,
          },
          finishedAt: new Date(),
        }),
        repository.failProviderRun({
          runId: claimed.runId,
          status: 'FAILED',
          errorCode: 'TTS_PROVIDER_FAILED',
          retryable: true,
          finishedAt: new Date(),
        }),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      const terminal = await pool.query<{ status: string }>(
        `select status from tts_provider_runs where id = $1`,
        [claimed.runId],
      );
      expect(['SUCCEEDED', 'FAILED']).toContain(terminal.rows[0]?.status);
    });

    it('stale item lease의 STARTED run은 결과 불명 terminal로 닫힌다', async () => {
      const fixture = await createProviderFixture();
      const repository = new DrizzleTtsDurabilityRepository(
        drizzle({ client: pool, schema }) as never,
      );
      await repository.claimProviderRun({
        item: {
          itemId: fixture.item,
          attempt: 1,
          leaseToken: 'lease-1',
        },
        cacheKey: fixture.cacheKey,
        cacheClaimToken: 'cache-claim',
        provider: 'LOCAL_FAKE',
        model: 'deterministic-v1',
        claimedAt: new Date(),
      });

      await expect(
        repository.findProviderRun({
          itemId: fixture.item,
          attempt: 1,
          leaseToken: 'lease-redelivered',
        }),
      ).resolves.toMatchObject({ kind: 'OUTCOME_UNKNOWN' });
    });

    it('READY 참조와 GC delete claim 경쟁은 둘 중 하나만 storage key를 소유한다', async () => {
      const storageKey = `private/tts/gc-${randomUUID()}.wav`;
      cleanupKeys.push(storageKey);
      const repository = new DrizzleTtsDurabilityRepository(
        drizzle({ client: pool, schema }) as never,
        () => new Date(),
        () => 'lease-1',
      );
      const object = { ...media, storageKey };
      const mediaId = randomUUID();
      await repository.registerAudioGc({
        media: object,
        registeredAt: new Date(Date.now() - 10 * 60 * 1000),
      });

      const [referenceResult, gcClaims] = await Promise.all([
        drizzle({ client: pool, schema }).transaction(async (transaction) => {
          const result = await repository.markAudioReferenced(
            transaction as never,
            {
              media: object,
              referencedAt: new Date(),
            },
          );
          if (result === 'REFERENCED') {
            await transaction.insert(schema.mediaAssets).values({
              id: mediaId,
              storageKey,
              declaredMimeType: 'audio/wav',
              declaredSizeBytes: object.sizeBytes,
              declaredSha256: object.sha256,
              mimeType: 'audio/wav',
              sizeBytes: object.sizeBytes,
              sha256: object.sha256,
              status: 'READY',
              readyAt: new Date(),
            });
          }
          return result;
        }),
        repository.claimAudioGcBatch({
          workerId: 'worker-a',
          batchSize: 1,
          leaseDurationMs: 60_000,
        }),
      ]);
      expect((referenceResult === 'REFERENCED' ? 1 : 0) + gcClaims.length).toBe(
        1,
      );
    });

    it('실제 READY cache·SUCCEEDED item 참조는 같은 storage key의 GC claim을 막는다', async () => {
      const fixture = await createProviderFixture();
      const storageKey = `private/tts/gc-${randomUUID()}.wav`;
      const mediaId = randomUUID();
      cleanupKeys.push(storageKey);
      await pool.query(
        `insert into media_assets (
           id, storage_key, declared_mime_type, declared_size_bytes,
           declared_sha256, status
         ) values ($1, $2, 'audio/wav', 204, $3, 'UPLOADING')`,
        [mediaId, storageKey, media.sha256],
      );
      await pool.query(
        `update tts_audio_cache
         set status = 'READY', media_asset_id = $2,
             ready_metadata_revision = 'v1', ready_at = now()
         where cache_key = $1`,
        [fixture.cacheKey, mediaId],
      );
      await pool.query(
        `update tts_items
         set status = 'SUCCEEDED', media_asset_id = $2
         where id = $1`,
        [fixture.item, mediaId],
      );
      const repository = new DrizzleTtsDurabilityRepository(
        drizzle({ client: pool, schema }) as never,
      );
      await repository.registerAudioGc({
        media: { ...media, storageKey },
        registeredAt: new Date(Date.now() - 10 * 60 * 1000),
      });

      await expect(
        repository.claimAudioGcBatch({
          workerId: 'worker-reference',
          batchSize: 1,
          leaseDurationMs: 60_000,
        }),
      ).resolves.toEqual([]);
    });

    it('실제 문장·어휘 발음 attachment는 UPLOADING media여도 GC claim을 막는다', async () => {
      const storageKey = `private/tts/gc-${randomUUID()}.wav`;
      const mediaId = randomUUID();
      const sentenceId = randomUUID();
      const vocabularyId = randomUUID();
      cleanupKeys.push(storageKey);
      cleanupSentences.push(sentenceId);
      cleanupVocabularies.push(vocabularyId);
      await pool.query(
        `insert into media_assets (
           id, storage_key, declared_mime_type, declared_size_bytes,
           declared_sha256, status
         ) values ($1, $2, 'audio/wav', 204, $3, 'UPLOADING')`,
        [mediaId, storageKey, media.sha256],
      );
      await pool.query(`insert into thai_sentences (id) values ($1)`, [
        sentenceId,
      ]);
      await pool.query(
        `insert into thai_sentence_versions (
           sentence_id, version, original_text, translation_ko,
           pronunciation_ko, tone_marks, media_asset_id
         ) values ($1, 1, 'ไทย', '태국어', '타이어', '-', $2)`,
        [sentenceId, mediaId],
      );
      await pool.query(
        `insert into vocabularies (
           id, thai, normalized_thai, kind, status
         ) values ($1, 'ไทย', $2, 'WORD', 'DRAFT')`,
        [vocabularyId, `pg-${vocabularyId}`],
      );
      await pool.query(
        `insert into vocabulary_pronunciations (
           vocabulary_id, pronunciation_ko, tone_marks, media_asset_id
         ) values ($1, '타이어', '-', $2)`,
        [vocabularyId, mediaId],
      );
      const repository = new DrizzleTtsDurabilityRepository(
        drizzle({ client: pool, schema }) as never,
      );
      await repository.registerAudioGc({
        media: { ...media, storageKey },
        registeredAt: new Date(Date.now() - 10 * 60 * 1000),
      });

      await expect(
        repository.claimAudioGcBatch({
          workerId: 'worker-attachment',
          batchSize: 1,
          leaseDurationMs: 60_000,
        }),
      ).resolves.toEqual([]);
    });

    it('GC transaction rollback은 PENDING record를 terminal로 만들지 않는다', async () => {
      const storageKey = `private/tts/gc-${randomUUID()}.wav`;
      cleanupKeys.push(storageKey);
      const database = drizzle({ client: pool, schema });
      const repository = new DrizzleTtsDurabilityRepository(database as never);
      const object = { ...media, storageKey };
      await repository.registerAudioGc({
        media: object,
        registeredAt: new Date(),
      });

      await expect(
        database.transaction(async (transaction) => {
          await repository.markAudioReferenced(transaction as never, {
            media: object,
            referencedAt: new Date(),
          });
          throw new Error('ROLLBACK');
        }),
      ).rejects.toThrow('ROLLBACK');
      const status = await pool.query<{ status: string }>(
        `select status from tts_audio_gc_records where storage_key = $1`,
        [storageKey],
      );
      expect(status.rows[0]?.status).toBe('PENDING');
    });

    it('만료 lease redelivery 뒤 이전 owner ack를 거부한다', async () => {
      const storageKey = `private/tts/gc-${randomUUID()}.wav`;
      cleanupKeys.push(storageKey);
      let clock = new Date('2026-07-28T05:00:00.000Z');
      let lease = 'lease-a';
      const repository = new DrizzleTtsDurabilityRepository(
        drizzle({ client: pool, schema }) as never,
        () => clock,
        () => lease,
      );
      await repository.registerAudioGc({
        media: { ...media, storageKey },
        registeredAt: clock,
      });
      clock = new Date('2026-07-28T05:05:01.000Z');
      const [first] = await repository.claimAudioGcBatch({
        workerId: 'worker-a',
        batchSize: 1,
        leaseDurationMs: 1_000,
      });
      clock = new Date('2026-07-28T05:05:03.000Z');
      lease = 'lease-b';
      const [second] = await repository.claimAudioGcBatch({
        workerId: 'worker-b',
        batchSize: 1,
        leaseDurationMs: 1_000,
      });

      await expect(
        repository.acknowledgeAudioDeleted({
          id: first!.id,
          leaseOwner: first!.leaseOwner,
          deletedAt: clock,
        }),
      ).resolves.toBe(false);
      expect(second?.leaseOwner).toBe('worker-b:lease-b');
    });
  },
);
