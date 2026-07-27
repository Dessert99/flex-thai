/** 감사 기록 검색·페이지·상세 read adapter를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { auditLogs, users } from '../schema/index.js';
import { DrizzleAuditLogQuery } from './drizzle-audit-log.query.js';

const now = new Date('2026-07-26T00:00:00.000Z');
const userId = '00000000-0000-4000-8000-000000000001';
const auditId = '00000000-0000-4000-8000-000000000002';

const createDatabase = (results: unknown[][]) => {
  const queue = [...results];
  const calls: Array<{ operation: string; table?: unknown }> = [];
  const select = vi.fn(() => {
    const chain = {
      from: vi.fn((table: unknown) => {
        calls.push({ operation: 'from', table });
        return chain;
      }),
      leftJoin: vi.fn((table: unknown) => {
        calls.push({ operation: 'leftJoin', table });
        return chain;
      }),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => Promise.resolve(queue.shift() ?? [])),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
    };
    return chain;
  });
  return { calls, database: { select } };
};

describe('DrizzleAuditLogQuery', () => {
  it('검색·필터·기간을 AND 결합해 stable 최신순 페이지를 반환한다', async () => {
    const fake = createDatabase([
      [{ total: 21 }],
      [
        {
          id: auditId,
          actorSub: 'admin-sub',
          actorUserId: userId,
          actorEmail: 'admin@hufs.ac.kr',
          action: 'IDENTITY_USER_DISABLED',
          target: `users/${userId}`,
          targetType: 'USER',
          targetId: userId,
          createdAt: now,
        },
      ],
    ]);
    const query = new DrizzleAuditLogQuery(fake.database as never);

    await expect(
      query.list({
        query: 'admin',
        actorUserId: userId,
        action: 'IDENTITY_USER_DISABLED',
        targetType: 'USER',
        targetId: userId,
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-07-31T00:00:00.000Z'),
        page: 2,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: auditId,
          actor: {
            kind: 'USER',
            userId,
            email: 'admin@hufs.ac.kr',
          },
          action: 'IDENTITY_USER_DISABLED',
          target: `users/${userId}`,
          targetType: 'USER',
          targetId: userId,
          createdAt: now,
        },
      ],
      page: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
    });
    expect(fake.calls).toEqual([
      { operation: 'from', table: auditLogs },
      { operation: 'leftJoin', table: users },
      { operation: 'from', table: auditLogs },
      { operation: 'leftJoin', table: users },
    ]);
  });

  it('사용자 연결이 없는 legacy 행을 SYSTEM actor와 nullable target으로 읽는다', async () => {
    const fake = createDatabase([
      [
        {
          id: auditId,
          actorSub: 'migration',
          actorUserId: null,
          actorEmail: null,
          action: 'MIGRATED',
          target: 'legacy',
          targetType: null,
          targetId: null,
          summary: { count: 1 },
          requestId: 'request-1',
          createdAt: now,
        },
      ],
    ]);
    const query = new DrizzleAuditLogQuery(fake.database as never);

    await expect(query.findById(auditId)).resolves.toEqual({
      id: auditId,
      actor: { kind: 'SYSTEM', label: 'migration' },
      action: 'MIGRATED',
      target: 'legacy',
      targetType: null,
      targetId: null,
      summary: { count: 1 },
      requestId: 'request-1',
      createdAt: now,
    });
  });

  it('없는 상세는 null이며 조회 중 audit write를 수행하지 않는다', async () => {
    const fake = createDatabase([[]]);
    const query = new DrizzleAuditLogQuery(fake.database as never);

    await expect(query.findById(auditId)).resolves.toBeNull();
    expect(fake.database).not.toHaveProperty('insert');
  });
});
