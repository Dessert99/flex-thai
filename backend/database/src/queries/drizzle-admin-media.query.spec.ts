/** 관리자 media 상세가 actual metadata·사용처만 공개하도록 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  mediaAssets,
  thaiSentenceVersions,
  vocabularyPronunciations,
} from '../schema/index.js';
import { DrizzleAdminMediaQuery } from './drizzle-admin-media.query.js';

const createSelectFake = (results: Array<Array<Record<string, unknown>>>) => {
  const queue = [...results];
  const calls: Array<{ fields: Record<string, unknown>; table?: unknown }> = [];
  const select = vi.fn((fields: Record<string, unknown>) => {
    const call = { fields, table: undefined as unknown };
    calls.push(call);
    const chain = {
      from: vi.fn((table: unknown) => {
        call.table = table;
        return chain;
      }),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => Promise.resolve(queue.shift() ?? [])),
      limit: vi.fn(() => Promise.resolve(queue.shift() ?? [])),
    };
    return chain;
  });
  return { calls, database: { select } };
};

describe('DrizzleAdminMediaQuery', () => {
  it('storage key 없이 상태·선언/actual metadata와 발음·문장 사용 ID/count를 반환한다', async () => {
    const fake = createSelectFake([
      [
        {
          id: 'media-id',
          kind: 'AUDIO',
          declaredMimeType: 'audio/mpeg',
          declaredSizeBytes: 3,
          declaredSha256: 'a'.repeat(64),
          mimeType: 'audio/mpeg',
          sizeBytes: 3,
          sha256: 'a'.repeat(64),
          status: 'READY',
          readyAt: new Date('2026-07-24T00:10:00.000Z'),
          createdAt: new Date('2026-07-24T00:00:00.000Z'),
        },
      ],
      [{ id: 'pronunciation-1' }, { id: 'pronunciation-2' }],
      [{ id: 'sentence-version-1' }],
    ]);
    const query = new DrizzleAdminMediaQuery(fake.database as never);

    const result = await query.findById('media-id');

    expect(result).toMatchObject({
      id: 'media-id',
      status: 'READY',
      usage: {
        pronunciations: {
          count: 2,
          ids: ['pronunciation-1', 'pronunciation-2'],
        },
        sentences: { count: 1, ids: ['sentence-version-1'] },
      },
    });
    expect(result).not.toHaveProperty('storageKey');
    expect(fake.calls.map((call) => call.table)).toEqual([
      mediaAssets,
      vocabularyPronunciations,
      thaiSentenceVersions,
    ]);
    expect(Object.keys(fake.calls[0]?.fields ?? {})).not.toContain(
      'storageKey',
    );
  });

  it('없는 media asset은 null을 반환하고 사용처를 조회하지 않는다', async () => {
    const fake = createSelectFake([[]]);
    const query = new DrizzleAdminMediaQuery(fake.database as never);

    await expect(query.findById('missing-id')).resolves.toBeNull();
    expect(fake.calls).toHaveLength(1);
  });

  it('REJECTED의 불일치 actual metadata를 storage key 없이 반환한다', async () => {
    const fake = createSelectFake([
      [
        {
          id: 'media-id',
          kind: 'AUDIO',
          declaredMimeType: 'audio/mpeg',
          declaredSizeBytes: 3,
          declaredSha256: 'a'.repeat(64),
          mimeType: 'application/octet-stream',
          sizeBytes: 4,
          sha256: 'b'.repeat(64),
          status: 'REJECTED',
          readyAt: null,
          createdAt: new Date('2026-07-24T00:00:00.000Z'),
        },
      ],
      [],
      [],
    ]);
    const query = new DrizzleAdminMediaQuery(fake.database as never);

    await expect(query.findById('media-id')).resolves.toMatchObject({
      status: 'REJECTED',
      mimeType: 'application/octet-stream',
      sizeBytes: 4,
      sha256: 'b'.repeat(64),
      readyAt: null,
    });
  });

  it('선언값과 모두 같은 REJECTED projection은 손상된 상태로 거절한다', async () => {
    const fake = createSelectFake([
      [
        {
          id: 'media-id',
          kind: 'AUDIO',
          declaredMimeType: 'audio/mpeg',
          declaredSizeBytes: 3,
          declaredSha256: 'a'.repeat(64),
          mimeType: 'audio/mpeg',
          sizeBytes: 3,
          sha256: 'a'.repeat(64),
          status: 'REJECTED',
          readyAt: null,
          createdAt: new Date('2026-07-24T00:00:00.000Z'),
        },
      ],
      [],
      [],
    ]);
    const query = new DrizzleAdminMediaQuery(fake.database as never);

    await expect(query.findById('media-id')).rejects.toMatchObject({
      code: 'ADMIN_MEDIA_READY_METADATA_INVALID',
    });
  });
});
