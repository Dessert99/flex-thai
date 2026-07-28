/** 실제 PostgreSQL에서 TTS voice preset version과 audit 원자성을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleTtsVoicePresetRepository } from './drizzle-tts-voice-preset.repository.js';

const databaseUrl = process.env.TTS_PRESET_TEST_DATABASE_URL;

describe.runIf(databaseUrl !== undefined)(
  'TTS voice preset PostgreSQL 원자성',
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TTS_PRESET_TEST_DATABASE_URL_REQUIRED');
      pool = new Pool({ connectionString: databaseUrl });
    });

    afterAll(async () => {
      await pool.end();
    });

    it('새 version은 source를 바꾸지 않고 감사 한 건과 함께 commit한다', async () => {
      const ids = {
        user: randomUUID(),
        source: randomUUID(),
        version: randomUUID(),
        request: randomUUID(),
      };
      await pool.query(
        `insert into users (id, cognito_sub, email, role, status)
         values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
        [ids.user, `preset-${ids.user}`, `preset-${ids.user}@example.com`],
      );
      const sourceUpdatedAt = new Date('2026-07-28T00:00:00.000Z');
      await pool.query(
        `insert into tts_voice_presets (
           id, name, provider, model, voice, locale, audio_format,
           generation_revision, enabled, created_at, updated_at
         ) values ($1, 'thai-default', 'local', 'v1', 'thai', 'th-TH',
                   'audio/wav', 'r1', true, $2, $2)`,
        [ids.source, sourceUpdatedAt],
      );
      const repository = new DrizzleTtsVoicePresetRepository(
        drizzle({ client: pool }) as never,
      );

      await repository.createVersion({
        id: ids.version,
        sourcePresetId: ids.source,
        expectedUpdatedAt: sourceUpdatedAt,
        provider: 'local',
        model: 'v2',
        voice: 'thai-v2',
        locale: 'th-TH',
        audioFormat: 'audio/wav',
        generationRevision: 'r2',
        enabled: false,
        context: {
          actorSub: `preset-${ids.user}`,
          actorUserId: ids.user,
          requestId: ids.request,
        },
        occurredAt: new Date('2026-07-28T01:00:00.000Z'),
      });

      const state = await pool.query<{
        model: string;
        auditCount: string;
        versionCount: string;
      }>(
        `select
           (select model from tts_voice_presets where id = $1) model,
           (select count(*)::text from tts_voice_presets
            where name = 'thai-default') "versionCount",
           (select count(*)::text from audit_logs
            where request_id = $2 and action = 'TTS_VOICE_PRESET_VERSION_CREATED')
             "auditCount"`,
        [ids.source, ids.request],
      );
      expect(state.rows[0]).toEqual({
        model: 'v1',
        versionCount: '2',
        auditCount: '1',
      });
    });
  },
);
