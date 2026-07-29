/** 실제 PostgreSQL에서 TTS voice preset version과 audit 원자성을 검증한다 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleTtsVoicePresetRepository } from './drizzle-tts-voice-preset.repository.js';

const databaseUrl = process.env.TTS_PRESET_TEST_DATABASE_URL;

const createActor = async (pool: Pool) => {
  const userId = randomUUID();
  const actorSub = `preset-${userId}`;
  await pool.query(
    `insert into users (id, cognito_sub, email, role, status)
     values ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
    [userId, actorSub, `${actorSub}@example.com`],
  );
  return { actorSub, userId };
};

const insertPreset = async (
  pool: Pool,
  input: {
    id: string;
    name: string;
    generationRevision: string;
    enabled?: boolean;
    updatedAt: Date;
  },
) => {
  await pool.query(
    `insert into tts_voice_presets (
       id, name, provider, model, voice, locale, audio_format,
       generation_revision, enabled, created_at, updated_at
     ) values ($1, $2, 'local', 'v1', 'thai', 'th-TH',
               'audio/wav', $3, $4, $5, $5)`,
    [
      input.id,
      input.name,
      input.generationRevision,
      input.enabled ?? true,
      input.updatedAt,
    ],
  );
};

const withRejectedAudit = async (
  pool: Pool,
  requestId: string,
  run: () => Promise<unknown>,
) => {
  const suffix = requestId.replaceAll('-', '');
  const functionName = `reject_tts_preset_audit_${suffix}`;
  const triggerName = `reject_tts_preset_audit_trigger_${suffix}`;
  await pool.query(`
    create function "${functionName}"() returns trigger language plpgsql as $$
    begin
      if new.request_id = '${requestId}'::uuid then
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
    await run();
  } finally {
    await pool.query(`drop trigger if exists "${triggerName}" on audit_logs`);
    await pool.query(`drop function if exists "${functionName}"()`);
  }
};

describe.runIf(databaseUrl !== undefined)(
  'TTS voice preset PostgreSQL 원자성',
  () => {
    let pool: Pool;

    beforeAll(() => {
      if (!databaseUrl)
        throw new Error('TTS_PRESET_TEST_DATABASE_URL_REQUIRED');
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

    it('동시 같은 revision 생성은 하나만 commit하고 source row를 바꾸지 않는다', async () => {
      const actor = await createActor(pool);
      const sourceId = randomUUID();
      const sourceUpdatedAt = new Date('2026-07-28T02:00:00.000Z');
      await insertPreset(pool, {
        id: sourceId,
        name: `concurrent-${sourceId}`,
        generationRevision: 'r1',
        updatedAt: sourceUpdatedAt,
      });
      const repository = new DrizzleTtsVoicePresetRepository(
        drizzle({ client: pool }) as never,
      );
      const create = (id: string, requestId: string) =>
        repository.createVersion({
          id,
          sourcePresetId: sourceId,
          expectedUpdatedAt: sourceUpdatedAt,
          provider: 'local',
          model: 'v2',
          voice: 'thai-v2',
          locale: 'th-TH',
          audioFormat: 'audio/wav',
          generationRevision: 'r2',
          enabled: true,
          context: {
            actorSub: actor.actorSub,
            actorUserId: actor.userId,
            requestId,
          },
          occurredAt: new Date('2026-07-28T02:01:00.000Z'),
        });

      const results = await Promise.allSettled([
        create(randomUUID(), randomUUID()),
        create(randomUUID(), randomUUID()),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const state = await pool.query<{
        auditCount: string;
        sourceModel: string;
        sourceUpdatedAt: Date;
        versionCount: string;
      }>(
        `select
           (select model from tts_voice_presets where id = $1) "sourceModel",
           (select updated_at from tts_voice_presets where id = $1)
             "sourceUpdatedAt",
           (select count(*)::text from tts_voice_presets
            where name = $2) "versionCount",
           (select count(*)::text from audit_logs
            where action = 'TTS_VOICE_PRESET_VERSION_CREATED'
              and target_id in (
                select id from tts_voice_presets where name = $2
              )) "auditCount"`,
        [sourceId, `concurrent-${sourceId}`],
      );
      expect(state.rows[0]).toMatchObject({
        auditCount: '1',
        sourceModel: 'v1',
        versionCount: '2',
      });
      expect(state.rows[0]?.sourceUpdatedAt.toISOString()).toBe(
        sourceUpdatedAt.toISOString(),
      );
    });

    it('stale toggle은 enabled와 updatedAt을 바꾸거나 감사를 남기지 않는다', async () => {
      const actor = await createActor(pool);
      const presetId = randomUUID();
      const requestId = randomUUID();
      const updatedAt = new Date('2026-07-28T03:00:00.000Z');
      await insertPreset(pool, {
        id: presetId,
        name: `stale-${presetId}`,
        generationRevision: 'r1',
        updatedAt,
      });
      const repository = new DrizzleTtsVoicePresetRepository(
        drizzle({ client: pool }) as never,
      );

      await expect(
        repository.setEnabled({
          presetId,
          expectedUpdatedAt: new Date('2026-07-28T02:59:00.000Z'),
          enabled: false,
          context: {
            actorSub: actor.actorSub,
            actorUserId: actor.userId,
            requestId,
          },
          occurredAt: new Date('2026-07-28T03:01:00.000Z'),
        }),
      ).rejects.toThrow('TTS_VOICE_PRESET_STALE_REVISION');

      const state = await pool.query<{
        auditCount: string;
        enabled: boolean;
        updatedAt: Date;
      }>(
        `select
           enabled,
           updated_at "updatedAt",
           (select count(*)::text from audit_logs where request_id = $2)
             "auditCount"
         from tts_voice_presets where id = $1`,
        [presetId, requestId],
      );
      expect(state.rows[0]).toMatchObject({ auditCount: '0', enabled: true });
      expect(state.rows[0]?.updatedAt.toISOString()).toBe(
        updatedAt.toISOString(),
      );
    });

    it('toggle 성공은 enabled 변경과 감사 한 건을 함께 commit한다', async () => {
      const actor = await createActor(pool);
      const presetId = randomUUID();
      const requestId = randomUUID();
      const updatedAt = new Date('2026-07-28T04:00:00.000Z');
      const occurredAt = new Date('2026-07-28T04:01:00.000Z');
      await insertPreset(pool, {
        id: presetId,
        name: `toggle-${presetId}`,
        generationRevision: 'r1',
        updatedAt,
      });
      const repository = new DrizzleTtsVoicePresetRepository(
        drizzle({ client: pool }) as never,
      );

      await repository.setEnabled({
        presetId,
        expectedUpdatedAt: updatedAt,
        enabled: false,
        context: {
          actorSub: actor.actorSub,
          actorUserId: actor.userId,
          requestId,
        },
        occurredAt,
      });

      const state = await pool.query<{
        auditCount: string;
        enabled: boolean;
        updatedAt: Date;
      }>(
        `select
           enabled,
           updated_at "updatedAt",
           (select count(*)::text from audit_logs
            where request_id = $2 and action = 'TTS_VOICE_PRESET_DISABLED')
             "auditCount"
         from tts_voice_presets where id = $1`,
        [presetId, requestId],
      );
      expect(state.rows[0]).toMatchObject({ auditCount: '1', enabled: false });
      expect(state.rows[0]?.updatedAt.toISOString()).toBe(
        occurredAt.toISOString(),
      );
    });

    it('최초 preset audit 실패는 생성 row를 rollback한다', async () => {
      const actor = await createActor(pool);
      const presetId = randomUUID();
      const requestId = randomUUID();
      const repository = new DrizzleTtsVoicePresetRepository(
        drizzle({ client: pool }) as never,
      );

      await expect(
        withRejectedAudit(pool, requestId, () =>
          repository.createInitial({
            id: presetId,
            name: `rollback-initial-${presetId}`,
            provider: 'local',
            model: 'v1',
            voice: 'thai',
            locale: 'th-TH',
            audioFormat: 'audio/wav',
            generationRevision: 'r1',
            enabled: true,
            context: {
              actorSub: actor.actorSub,
              actorUserId: actor.userId,
              requestId,
            },
            occurredAt: new Date('2026-07-28T05:00:00.000Z'),
          }),
        ),
      ).rejects.toThrow('AUDIT_TRIGGER_FAILED');

      const state = await pool.query<{
        auditCount: string;
        presetCount: string;
      }>(
        `select
           (select count(*)::text from tts_voice_presets where id = $1)
             "presetCount",
           (select count(*)::text from audit_logs where request_id = $2)
             "auditCount"`,
        [presetId, requestId],
      );
      expect(state.rows[0]).toEqual({
        auditCount: '0',
        presetCount: '0',
      });
    });

    it('새 version audit 실패는 source를 보존하고 생성 row를 rollback한다', async () => {
      const actor = await createActor(pool);
      const sourceId = randomUUID();
      const versionId = randomUUID();
      const requestId = randomUUID();
      const sourceUpdatedAt = new Date('2026-07-28T06:00:00.000Z');
      const name = `rollback-version-${sourceId}`;
      await insertPreset(pool, {
        id: sourceId,
        name,
        generationRevision: 'r1',
        updatedAt: sourceUpdatedAt,
      });
      const repository = new DrizzleTtsVoicePresetRepository(
        drizzle({ client: pool }) as never,
      );

      await expect(
        withRejectedAudit(pool, requestId, () =>
          repository.createVersion({
            id: versionId,
            sourcePresetId: sourceId,
            expectedUpdatedAt: sourceUpdatedAt,
            provider: 'local',
            model: 'v2',
            voice: 'thai-v2',
            locale: 'th-TH',
            audioFormat: 'audio/wav',
            generationRevision: 'r2',
            enabled: true,
            context: {
              actorSub: actor.actorSub,
              actorUserId: actor.userId,
              requestId,
            },
            occurredAt: new Date('2026-07-28T06:01:00.000Z'),
          }),
        ),
      ).rejects.toThrow('AUDIT_TRIGGER_FAILED');

      const state = await pool.query<{
        auditCount: string;
        sourceModel: string;
        versionCount: string;
      }>(
        `select
           (select model from tts_voice_presets where id = $1) "sourceModel",
           (select count(*)::text from tts_voice_presets where name = $2)
             "versionCount",
           (select count(*)::text from audit_logs where request_id = $3)
             "auditCount"`,
        [sourceId, name, requestId],
      );
      expect(state.rows[0]).toEqual({
        auditCount: '0',
        sourceModel: 'v1',
        versionCount: '1',
      });
    });

    it('toggle audit 실패는 enabled와 updatedAt을 rollback한다', async () => {
      const actor = await createActor(pool);
      const presetId = randomUUID();
      const requestId = randomUUID();
      const updatedAt = new Date('2026-07-28T07:00:00.000Z');
      await insertPreset(pool, {
        id: presetId,
        name: `rollback-toggle-${presetId}`,
        generationRevision: 'r1',
        updatedAt,
      });
      const repository = new DrizzleTtsVoicePresetRepository(
        drizzle({ client: pool }) as never,
      );

      await expect(
        withRejectedAudit(pool, requestId, () =>
          repository.setEnabled({
            presetId,
            expectedUpdatedAt: updatedAt,
            enabled: false,
            context: {
              actorSub: actor.actorSub,
              actorUserId: actor.userId,
              requestId,
            },
            occurredAt: new Date('2026-07-28T07:01:00.000Z'),
          }),
        ),
      ).rejects.toThrow('AUDIT_TRIGGER_FAILED');

      const state = await pool.query<{
        auditCount: string;
        enabled: boolean;
        updatedAt: Date;
      }>(
        `select
           enabled,
           updated_at "updatedAt",
           (select count(*)::text from audit_logs where request_id = $2)
             "auditCount"
         from tts_voice_presets where id = $1`,
        [presetId, requestId],
      );
      expect(state.rows[0]).toMatchObject({ auditCount: '0', enabled: true });
      expect(state.rows[0]?.updatedAt.toISOString()).toBe(
        updatedAt.toISOString(),
      );
    });
  },
);
