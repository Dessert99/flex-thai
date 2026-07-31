/** TTS voice preset command가 immutable version과 감사 원자성을 지키는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { auditLogs } from '../../schema/identity.schema.js';
import { ttsVoicePresets } from '../../schema/tts.schema.js';
import { DrizzleTtsVoicePresetRepository } from './drizzle-tts-voice-preset.repository.js';

const source = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'thai-default',
  provider: 'local',
  model: 'deterministic-v1',
  voice: 'thai-female',
  locale: 'th-TH',
  audioFormat: 'audio/wav',
  generationRevision: '2026-07-28',
  enabled: true,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
} as const;
const context = {
  actorSub: 'admin-sub',
  actorUserId: '00000000-0000-4000-8000-000000000002',
  requestId: '00000000-0000-4000-8000-000000000003',
};

const createDatabase = (row: typeof source | null = source) => {
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  let locked = false;
  const transaction = async (
    callback: (session: never) => Promise<unknown>,
  ) => {
    const session = {
      select: () => {
        const chain = {
          from: () => chain,
          where: () => chain,
          for: () => {
            locked = true;
            return chain;
          },
          limit: () => Promise.resolve(row ? [row] : []),
        };
        return chain;
      },
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          inserts.push({ table, values });
          return {
            returning: () =>
              Promise.resolve(
                table === ttsVoicePresets
                  ? [{ ...source, ...values }]
                  : [{ id: context.requestId }],
              ),
          };
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => ({
            returning: () => {
              updates.push({ table, values });
              return Promise.resolve([{ ...source, ...values }]);
            },
          }),
        }),
      }),
    };
    return callback(session as never);
  };
  return {
    database: { transaction },
    inserts,
    updates,
    get locked() {
      return locked;
    },
  };
};

describe('DrizzleTtsVoicePresetRepository', () => {
  it('source 이름을 복사한 새 row와 audit을 같은 transaction에 남긴다', async () => {
    const fake = createDatabase();
    const repository = new DrizzleTtsVoicePresetRepository(
      fake.database as never,
    );

    await repository.createVersion({
      id: '00000000-0000-4000-8000-000000000004',
      sourcePresetId: source.id,
      expectedUpdatedAt: source.updatedAt,
      provider: 'local',
      model: 'deterministic-v2',
      voice: 'thai-female-v2',
      locale: 'th-TH',
      audioFormat: 'audio/wav',
      generationRevision: '2026-08-01',
      enabled: false,
      context,
      occurredAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(fake.locked).toBe(true);
    expect(fake.updates).toHaveLength(0);
    const presetInsert = fake.inserts.find(
      ({ table }) => table === ttsVoicePresets,
    );
    const auditInsert = fake.inserts.find(({ table }) => table === auditLogs);
    expect(presetInsert?.values).toMatchObject({ name: source.name });
    expect(auditInsert?.values).toMatchObject({
      action: 'TTS_VOICE_PRESET_VERSION_CREATED',
      targetType: 'TTS_VOICE_PRESET',
      requestId: context.requestId,
    });
  });

  it('stale timestamp는 변경과 audit 전에 거절한다', async () => {
    const fake = createDatabase();
    const repository = new DrizzleTtsVoicePresetRepository(
      fake.database as never,
    );

    await expect(
      repository.setEnabled({
        presetId: source.id,
        expectedUpdatedAt: new Date('2026-07-27T00:00:00.000Z'),
        enabled: false,
        context,
        occurredAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'TTS_VOICE_PRESET_STALE_REVISION' });
    expect(fake.updates).toHaveLength(0);
    expect(fake.inserts).toHaveLength(0);
  });
});
