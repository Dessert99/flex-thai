/** media persistence의 row lock·조건부 terminal 전이·audit transaction을 고정한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import type { MediaAssetAuditContext } from '@flex-thia/domain';
import { auditLogs, mediaAssets } from '../schema/index.js';
import { DrizzleMediaAdminRepository } from './drizzle-media-admin.repository.js';

const context: MediaAssetAuditContext = {
  actorSub: 'cognito-sub',
  actorUserId: '00000000-0000-4000-8000-000000000001',
  requestId: 'request-id',
};
const sha256 = 'a'.repeat(64);
const baseRow = {
  id: '00000000-0000-4000-8000-000000000002',
  kind: 'AUDIO' as const,
  storageKey: 'audio/00000000-0000-4000-8000-000000000002',
  declaredMimeType: 'audio/mpeg',
  declaredSizeBytes: 3,
  declaredSha256: sha256,
  mimeType: null,
  sizeBytes: null,
  sha256: null,
  status: 'UPLOADING' as const,
  readyAt: null,
  createdAt: new Date('2026-07-24T00:00:00.000Z'),
};

const toSql = (condition: unknown) =>
  new PgDialect().sqlToQuery(condition as never);

const createFake = (lockedRow: Record<string, unknown> = baseRow) => {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const updates: Array<{
    table: unknown;
    values: Record<string, unknown>;
    condition: unknown;
  }> = [];
  const lockModes: unknown[] = [];
  const select = vi.fn(() => {
    const chain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      for: vi.fn(),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.for.mockImplementation((mode: unknown) => {
      lockModes.push(mode);
      return Promise.resolve([lockedRow]);
    });
    return chain;
  });
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((values: Record<string, unknown>) => {
      inserted.push({ table, values });
      return Promise.resolve();
    }),
  }));
  const update = vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn((condition: unknown) => {
        updates.push({ table, values, condition });
        return {
          returning: vi.fn().mockResolvedValue([{ id: baseRow.id }]),
        };
      }),
    })),
  }));
  const transactionValue = { insert, select, update };
  const database = {
    transaction: vi.fn(
      <T>(work: (transaction: typeof transactionValue) => Promise<T>) =>
        work(transactionValue),
    ),
  };
  return { database, inserted, lockModes, updates };
};

describe('DrizzleMediaAdminRepository', () => {
  it('UPLOADING 생성과 audit을 같은 transaction에 저장한다', async () => {
    const fake = createFake();
    const repository = new DrizzleMediaAdminRepository(fake.database as never);

    await repository.createUploadingWithAudit({
      asset: {
        ...baseRow,
        createdAt: undefined,
      } as never,
      context,
    });

    expect(fake.database.transaction).toHaveBeenCalledTimes(1);
    expect(fake.inserted.map((entry) => entry.table)).toEqual([
      mediaAssets,
      auditLogs,
    ]);
    expect(fake.inserted[1]?.values).toMatchObject({
      action: 'MEDIA_ASSET_UPLOAD_REQUESTED',
      targetType: 'MEDIA_ASSET',
      targetId: baseRow.id,
      requestId: 'request-id',
    });
  });

  it('row를 FOR UPDATE로 잠근 뒤 READY 전이와 audit을 함께 저장한다', async () => {
    const fake = createFake();
    const repository = new DrizzleMediaAdminRepository(fake.database as never);
    const readyAt = new Date('2026-07-24T00:10:00.000Z');

    const result = await repository.finalizeWithAudit({
      mediaAssetId: baseRow.id,
      inspection: { mimeType: 'audio/mpeg', sizeBytes: 3, sha256 },
      readyAt,
      context,
    });

    expect(fake.lockModes).toEqual(['update']);
    expect(result?.outcome).toBe('READY');
    expect(fake.updates[0]).toMatchObject({
      table: mediaAssets,
      values: {
        mimeType: 'audio/mpeg',
        sizeBytes: 3,
        sha256,
        status: 'READY',
        readyAt,
      },
    });
    const condition = toSql(fake.updates[0]?.condition);
    expect(condition.params).toEqual(
      expect.arrayContaining([baseRow.id, 'UPLOADING']),
    );
    expect(fake.inserted[0]).toMatchObject({
      table: auditLogs,
      values: { action: 'MEDIA_ASSET_READY', targetId: baseRow.id },
    });
  });

  it('metadata 불일치는 REJECTED와 audit을 commit 가능한 결과로 반환한다', async () => {
    const fake = createFake();
    const repository = new DrizzleMediaAdminRepository(fake.database as never);

    const result = await repository.finalizeWithAudit({
      mediaAssetId: baseRow.id,
      inspection: { mimeType: 'audio/ogg', sizeBytes: 3, sha256 },
      readyAt: new Date('2026-07-24T00:10:00.000Z'),
      context,
    });

    expect(result?.outcome).toBe('REJECTED');
    expect(fake.updates[0]).toMatchObject({
      table: mediaAssets,
      values: { status: 'REJECTED' },
    });
    expect(fake.inserted[0]).toMatchObject({
      table: auditLogs,
      values: { action: 'MEDIA_ASSET_REJECTED', targetId: baseRow.id },
    });
  });

  it('잠근 row가 이미 READY면 update와 audit을 수행하지 않는다', async () => {
    const fake = createFake({
      ...baseRow,
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256,
      status: 'READY',
      readyAt: new Date('2026-07-24T00:10:00.000Z'),
    });
    const repository = new DrizzleMediaAdminRepository(fake.database as never);

    const result = await repository.finalizeWithAudit({
      mediaAssetId: baseRow.id,
      inspection: { mimeType: 'audio/mpeg', sizeBytes: 3, sha256 },
      readyAt: new Date('2026-07-24T00:10:00.000Z'),
      context,
    });

    expect(result?.outcome).toBe('READY_UNCHANGED');
    expect(fake.updates).toEqual([]);
    expect(fake.inserted).toEqual([]);
  });
});
