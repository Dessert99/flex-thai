/** TTS voice preset 서비스의 active projection과 command 문맥을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { TtsVoicePresetsService } from './tts-voice-presets.service.js';

const ids = {
  active: '00000000-0000-4000-8000-000000000001',
  other: '00000000-0000-4000-8000-000000000002',
  created: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-000000000004',
  request: '00000000-0000-4000-8000-000000000005',
};
const row = {
  id: ids.active,
  name: 'thai-default',
  provider: 'local',
  model: 'deterministic-v1',
  voice: 'thai-female',
  locale: 'th-TH' as const,
  audioFormat: 'audio/wav' as const,
  generationRevision: '2026-07-28',
  enabled: true,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
};
const actor = { userId: ids.admin, sub: 'admin-sub', requestId: ids.request };

const createService = () => {
  const query = {
    list: vi.fn().mockResolvedValue({
      items: [row],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    }),
    findById: vi.fn().mockResolvedValue(row),
  };
  const repository = {
    createInitial: vi.fn().mockResolvedValue({ ...row, id: ids.created }),
    createVersion: vi.fn().mockResolvedValue({ ...row, id: ids.created }),
    setEnabled: vi.fn().mockResolvedValue({ ...row, enabled: false }),
  };
  return {
    query,
    repository,
    service: new TtsVoicePresetsService({
      query,
      repository,
      activePresetId: ids.active,
      generateId: () => ids.created,
      now: () => new Date('2026-07-28T01:00:00.000Z'),
    }),
  };
};

describe('TtsVoicePresetsService', () => {
  it('목록에 configured active 상태를 계산한다', async () => {
    const { service } = createService();

    await expect(
      service.list({ page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({ items: [{ id: ids.active, active: true }] });
  });

  it('active preset disable을 repository 호출 전에 409로 막는다', async () => {
    const { repository, service } = createService();

    await expect(
      service.disablePreset(actor, ids.active, {
        expectedUpdatedAt: row.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'TTS_VOICE_PRESET_ACTIVE_DISABLE' },
    });
    expect(repository.setEnabled).not.toHaveBeenCalled();
  });

  it('새 preset에 생성 UUID와 인증된 audit 문맥을 전달한다', async () => {
    const { repository, service } = createService();

    await service.createPreset(actor, {
      name: 'thai-default',
      provider: 'local',
      model: 'deterministic-v1',
      voice: 'thai-female',
      locale: 'th-TH',
      audioFormat: 'audio/wav',
      generationRevision: '2026-07-28',
      enabled: true,
    });

    expect(repository.createInitial).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ids.created,
        context: {
          actorSub: 'admin-sub',
          actorUserId: ids.admin,
          requestId: ids.request,
        },
        occurredAt: new Date('2026-07-28T01:00:00.000Z'),
      }),
    );
  });
});
