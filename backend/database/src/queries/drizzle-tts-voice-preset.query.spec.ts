/** TTS voice preset 조회가 안전한 projection과 stable page를 지키는지 검증한다 */
import { desc } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { ttsVoicePresets } from '../schema/tts.schema.js';
import { DrizzleTtsVoicePresetQuery } from './drizzle-tts-voice-preset.query.js';

const preset = {
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

const createDatabase = (results: unknown[][]) => {
  const queue = [...results];
  const calls: Array<{
    fields: Record<string, unknown>;
    orderBy?: unknown[];
    limit?: number;
    offset?: number;
  }> = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const call = { fields } as (typeof calls)[number];
    calls.push(call);
    const consume = () => Promise.resolve(queue.shift() ?? []);
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn((...orderBy: unknown[]) => {
        call.orderBy = orderBy;
        return chain;
      }),
      limit: vi.fn((limit: number) => {
        call.limit = limit;
        return chain;
      }),
      offset: vi.fn((offset: number) => {
        call.offset = offset;
        return consume();
      }),
      then: (resolve: (rows: unknown[]) => unknown) => consume().then(resolve),
    };
    return chain;
  });
  return { database: { select }, calls };
};

describe('DrizzleTtsVoicePresetQuery', () => {
  it('검색·enabled 조건의 stable page를 최신순으로 반환한다', async () => {
    const fake = createDatabase([[{ totalItems: 11 }], [preset]]);
    const query = new DrizzleTtsVoicePresetQuery(fake.database as never);

    await expect(
      query.list({ query: 'thai', enabled: true, page: 2, pageSize: 10 }),
    ).resolves.toEqual({
      items: [preset],
      page: { page: 2, pageSize: 10, totalItems: 11, totalPages: 2 },
    });
    expect(fake.calls[1]).toMatchObject({ limit: 10, offset: 10 });
    expect(fake.calls[1]?.orderBy).toEqual([
      desc(ttsVoicePresets.createdAt),
      desc(ttsVoicePresets.id),
    ]);
    expect(Object.keys(fake.calls[1]?.fields ?? {})).toEqual([
      'id',
      'name',
      'provider',
      'model',
      'voice',
      'locale',
      'audioFormat',
      'generationRevision',
      'enabled',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('없는 preset 상세는 null을 반환한다', async () => {
    const fake = createDatabase([[]]);
    const query = new DrizzleTtsVoicePresetQuery(fake.database as never);

    await expect(query.findById(preset.id)).resolves.toBeNull();
  });
});
