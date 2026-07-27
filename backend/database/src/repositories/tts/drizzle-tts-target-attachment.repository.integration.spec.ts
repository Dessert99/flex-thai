/** 실제 PostgreSQL에서 TTS 완료 rollback과 게시 경쟁의 row-lock 직렬화를 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../schema/index.js';
import { DrizzleTtsRepository } from './drizzle-tts.repository.js';
import { DrizzleTtsTargetAttachmentWriter } from './drizzle-tts-target-attachment.repository.js';

const databaseUrl = process.env.WAVE5_TTS_TEST_DATABASE_URL;
const voice = {
  presetId: '00000000-0000-4000-8000-000000000001',
  provider: 'deterministic',
  model: 'local-wav',
  voice: 'default',
  locale: 'th-TH' as const,
  audioFormat: 'audio/wav' as const,
  generationRevision: '1',
};

const createFixture = async (pool: Pool, frozen = false) => {
  const leaseUntil = new Date(Date.now() + 5 * 60 * 1000);
  const ids = {
    user: randomUUID(),
    questionType: randomUUID(),
    typeVersion: randomUUID(),
    topic: randomUUID(),
    question: randomUUID(),
    questionVersion: randomUUID(),
    sentence: randomUUID(),
    sentenceVersion: randomUUID(),
    block: randomUUID(),
    blockSentence: randomUUID(),
    media: randomUUID(),
    job: randomUUID(),
    item: randomUUID(),
    cache: randomUUID(),
  };
  await pool.query(
    `insert into users (id, cognito_sub, email, role, status)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
    [ids.user, `tts-${ids.user}`, `tts-${ids.user}@example.com`],
  );
  await pool.query(
    `insert into question_types (
       id, slug, display_name, skill, major_category
     ) values (
       $1, $2, 'TTS gate', 'READING', 'READING_VOCABULARY_GRAMMAR'
     )`,
    [ids.questionType, `tts-${ids.questionType}`],
  );
  await pool.query(
    `insert into question_type_versions (
       id, question_type_id, version, template, option_count, status,
       decision_rules
     ) values ($1, $2, 1, 'STANDARD_CHOICE', 1, 'ACTIVE', '{}'::jsonb)`,
    [ids.typeVersion, ids.questionType],
  );
  await pool.query(
    `insert into question_topics (id, slug, display_name, status)
     values ($1, $2, 'TTS gate', 'ACTIVE')`,
    [ids.topic, `tts-${ids.topic}`],
  );
  await pool.query(`insert into questions (id, status) values ($1, 'DRAFT')`, [
    ids.question,
  ]);
  await pool.query(
    `insert into question_versions (
       id, question_id, version, type_version_id, topic_id, difficulty,
       status, validation_status
     ) values ($1, $2, 1, $3, $4, 3, 'DRAFT', 'PASSED')`,
    [ids.questionVersion, ids.question, ids.typeVersion, ids.topic],
  );
  await pool.query(`insert into thai_sentences (id) values ($1)`, [
    ids.sentence,
  ]);
  await pool.query(
    `insert into thai_sentence_versions (
       id, sentence_id, version, original_text, translation_ko,
       pronunciation_ko, tone_marks, frozen_at
     ) values ($1, $2, 1, 'ภาษาไทย', '태국어', '파싸 타이', '', $3)`,
    [
      ids.sentenceVersion,
      ids.sentence,
      frozen ? new Date('2026-07-28T00:00:00Z') : null,
    ],
  );
  await pool.query(
    `insert into question_blocks (
       id, question_version_id, kind, display_mode, position
     ) values ($1, $2, 'QUESTION', 'TEXT_AND_AUDIO', 0)`,
    [ids.block, ids.questionVersion],
  );
  await pool.query(
    `insert into question_block_sentences (
       id, block_id, sentence_version_id, position
     ) values ($1, $2, $3, 0)`,
    [ids.blockSentence, ids.block, ids.sentenceVersion],
  );
  await pool.query(
    `insert into media_assets (
       id, storage_key, declared_mime_type, declared_size_bytes,
       declared_sha256, mime_type, size_bytes, sha256, status, ready_at
     ) values (
       $1, $2, 'audio/wav', 44, $3, 'audio/wav', 44, $3, 'READY', now()
     )`,
    [ids.media, `tts/${ids.media}.wav`, 'a'.repeat(64)],
  );
  await pool.query(
    `insert into tts_jobs (
       id, requested_by, voice_snapshot, status, processing_count
     ) values ($1, $2, $3::jsonb, 'RUNNING', 1)`,
    [ids.job, ids.user, JSON.stringify(voice)],
  );
  await pool.query(
    `insert into tts_audio_cache (
       id, cache_key, status, media_asset_id, ready_metadata_revision, ready_at
     ) values ($1, $2, 'READY', $3, '1', now())`,
    [ids.cache, `cache-${ids.cache}`, ids.media],
  );
  await pool.query(
    `insert into tts_items (
       id, job_id, target_kind, target_id, target_text, target_required,
       revision, voice_snapshot, cache_key, status, attempt, lease_token,
       lease_until
     ) values (
       $1, $2, 'THAI_SENTENCE_VERSION', $3, 'ภาษาไทย', true, $4,
       $5::jsonb, $6, 'PROCESSING', 1, 'lease-token',
       $7
     )`,
    [
      ids.item,
      ids.job,
      ids.sentenceVersion,
      ids.questionVersion,
      JSON.stringify(voice),
      `cache-${ids.cache}`,
      leaseUntil,
    ],
  );
  return { ...ids, leaseUntil };
};

const cleanupFixture = async (
  pool: Pool,
  ids: Awaited<ReturnType<typeof createFixture>>,
) => {
  await pool.query(`delete from tts_items where id = $1`, [ids.item]);
  await pool.query(`delete from tts_audio_cache where id = $1`, [ids.cache]);
  await pool.query(`delete from tts_jobs where id = $1`, [ids.job]);
  await pool.query(`delete from question_block_sentences where id = $1`, [
    ids.blockSentence,
  ]);
  await pool.query(`delete from question_blocks where id = $1`, [ids.block]);
  await pool.query(`delete from question_versions where id = $1`, [
    ids.questionVersion,
  ]);
  await pool.query(`delete from questions where id = $1`, [ids.question]);
  await pool.query(`delete from thai_sentence_versions where id = $1`, [
    ids.sentenceVersion,
  ]);
  await pool.query(`delete from thai_sentences where id = $1`, [ids.sentence]);
  await pool.query(`delete from question_type_versions where id = $1`, [
    ids.typeVersion,
  ]);
  await pool.query(`delete from question_types where id = $1`, [
    ids.questionType,
  ]);
  await pool.query(`delete from question_topics where id = $1`, [ids.topic]);
  await pool.query(`delete from media_assets where id = $1`, [ids.media]);
  await pool.query(`delete from users where id = $1`, [ids.user]);
};

const waitForLock = async (pool: Pool, applicationName: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      `select exists (
         select 1 from pg_stat_activity
         where application_name = $1 and wait_event_type = 'Lock'
       ) waiting`,
      [applicationName],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('TTS_ATTACHMENT_LOCK_WAIT_NOT_OBSERVED');
};

describe.runIf(databaseUrl !== undefined)(
  'TTS target attachment PostgreSQL 원자성',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!databaseUrl) {
        throw new Error('WAVE5_TTS_TEST_DATABASE_URL_REQUIRED');
      }
      pool = new Pool({ connectionString: databaseUrl });
      const migration = await pool.query<{ ttsItems: string | null }>(
        `select to_regclass('tts_items')::text "ttsItems"`,
      );
      if (!migration.rows[0]?.ttsItems) {
        throw new Error('Wave 5 migration이 적용된 격리 DB가 필요합니다.');
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    it('stale attachment는 앞선 item 성공 update까지 같은 transaction에서 rollback한다', async () => {
      const ids = await createFixture(pool, true);
      try {
        const repository = new DrizzleTtsRepository(
          drizzle({ client: pool, schema }) as never,
          new DrizzleTtsTargetAttachmentWriter(),
        );
        const result = await repository.succeed({
          kind: 'REUSED',
          item: {
            jobId: ids.job,
            itemId: ids.item,
            attempt: 1,
            leaseToken: 'lease-token',
            leaseUntil: ids.leaseUntil,
            target: {
              kind: 'THAI_SENTENCE_VERSION',
              targetId: ids.sentenceVersion,
              text: 'ภาษาไทย',
              required: true,
              revision: ids.questionVersion,
            },
            voice,
            cacheKey: `cache-${ids.cache}`,
          },
          mediaAssetId: ids.media,
          completedAt: new Date(),
        });
        const item = await pool.query<{
          leaseToken: string | null;
          mediaAssetId: string | null;
          status: string;
        }>(
          `select status, lease_token "leaseToken",
                  media_asset_id "mediaAssetId"
             from tts_items where id = $1`,
          [ids.item],
        );

        expect(result).toEqual({ kind: 'STALE_TARGET' });
        expect(item.rows[0]).toEqual({
          status: 'PROCESSING',
          leaseToken: 'lease-token',
          mediaAssetId: null,
        });
      } finally {
        await cleanupFixture(pool, ids);
      }
    });

    it('게시 row lock 뒤의 attachment는 게시 commit 후 stale로 재검증된다', async () => {
      const ids = await createFixture(pool);
      const applicationName = `tts-attachment-${randomUUID()}`;
      const writerPool = new Pool({
        connectionString: databaseUrl,
        application_name: applicationName,
      });
      const blocker: PoolClient = await pool.connect();
      try {
        await blocker.query('begin');
        await blocker.query(
          `select id from question_versions where id = $1 for update`,
          [ids.questionVersion],
        );
        const database = drizzle({ client: writerPool, schema });
        const attachment = database.transaction((transaction) =>
          new DrizzleTtsTargetAttachmentWriter().attach(transaction as never, {
            target: {
              kind: 'THAI_SENTENCE_VERSION',
              targetId: ids.sentenceVersion,
              text: 'ภาษาไทย',
              required: true,
              revision: ids.questionVersion,
            },
            mediaAssetId: ids.media,
            expectedRevision: ids.questionVersion,
          }),
        );
        await waitForLock(pool, applicationName);
        await blocker.query(
          `update question_versions set status = 'PUBLISHED' where id = $1`,
          [ids.questionVersion],
        );
        await blocker.query('commit');

        await expect(attachment).resolves.toBe('STALE_TARGET');
        const sentence = await pool.query<{ mediaAssetId: string | null }>(
          `select media_asset_id "mediaAssetId"
             from thai_sentence_versions where id = $1`,
          [ids.sentenceVersion],
        );
        expect(sentence.rows[0]?.mediaAssetId).toBeNull();
      } finally {
        await blocker.query('rollback').catch(() => undefined);
        blocker.release();
        await writerPool.end();
        await cleanupFixture(pool, ids);
      }
    });
  },
);
