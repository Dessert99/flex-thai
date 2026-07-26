/** 관리자 사용자 목록·상태와 transaction audit 저장을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { auditLogs, users } from '../schema/index.js';
import { DrizzleUserManagementQuery } from './drizzle-user-management.query.js';

const now = new Date('2026-07-26T00:00:00.000Z');
const row = {
  id: '00000000-0000-4000-8000-000000000002',
  cognitoSub: 'learner-sub',
  email: 'learner@hufs.ac.kr',
  role: 'LEARNER',
  status: 'ACTIVE',
  mfaEnrolledAt: null,
  createdAt: now,
  updatedAt: now,
} as const;

const createDatabase = (
  results: unknown[][],
  options?: { failAuditAction?: string },
) => {
  const queue = [...results];
  const calls: Array<{ operation: string; table?: unknown; value?: unknown }> =
    [];
  let commits = 0;
  const consume = () => Promise.resolve(queue.shift() ?? []);
  const select = vi.fn(() => {
    const chain = {
      from: vi.fn((table: unknown) => {
        calls.push({ operation: 'select', table });
        return chain;
      }),
      orderBy: vi.fn(consume),
    };
    return chain;
  });
  const update = vi.fn((table: unknown) => {
    const chain = {
      set: vi.fn((value: unknown) => {
        calls.push({ operation: 'update', table, value });
        return chain;
      }),
      where: vi.fn(() => chain),
      returning: vi.fn(consume),
    };
    return chain;
  });
  const insert = vi.fn((table: unknown) => {
    let insertedValue: unknown;
    const chain = {
      values: vi.fn((value: unknown) => {
        insertedValue = value;
        calls.push({ operation: 'insert', table, value });
        return chain;
      }),
      returning: vi.fn(consume),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (error: unknown) => unknown,
      ) => {
        const action =
          insertedValue &&
          typeof insertedValue === 'object' &&
          'action' in insertedValue
            ? insertedValue.action
            : undefined;
        const result =
          action === options?.failAuditAction
            ? Promise.reject(new Error('audit failed'))
            : consume();
        return result.then(resolve, reject);
      },
    };
    return chain;
  });
  const transaction = vi.fn(
    async (
      operation: (transaction: {
        insert: typeof insert;
        update: typeof update;
      }) => Promise<unknown>,
    ) => {
      const result = await operation({ insert, update });
      commits += 1;
      return result;
    },
  );
  return {
    calls,
    database: { insert, select, transaction, update },
    get commits() {
      return commits;
    },
  };
};

const statusChange = {
  action: 'IDENTITY_USER_DISABLED',
  actorSub: 'admin-sub',
  actorUserId: '00000000-0000-4000-8000-000000000001',
  occurredAt: now,
  requestId: 'request-1',
  status: 'DISABLED',
  userId: row.id,
} as const;

describe('DrizzleUserManagementQuery', () => {
  it('사용자 공개 필드만 stable 이메일 순서로 목록화한다', async () => {
    const fake = createDatabase([[row]]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(query.listManagedUsers()).resolves.toEqual([row]);

    expect(fake.calls).toContainEqual({ operation: 'select', table: users });
  });

  it('상태와 audit을 같은 transaction에서 저장하고 대상이 없으면 null이다', async () => {
    const fake = createDatabase([[{ ...row, status: 'DISABLED' }], [], []]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(
      query.changeStatusWithAudit(statusChange),
    ).resolves.toMatchObject({ status: 'DISABLED' });
    await expect(
      query.changeStatusWithAudit({
        ...statusChange,
        action: 'IDENTITY_USER_ENABLED',
        status: 'ACTIVE',
        userId: '00000000-0000-4000-8000-000000000099',
      }),
    ).resolves.toBeNull();

    expect(fake.calls[0]).toEqual({
      operation: 'update',
      table: users,
      value: { status: 'DISABLED', updatedAt: now },
    });
    expect(fake.calls[1]).toMatchObject({
      operation: 'insert',
      table: auditLogs,
    });
    expect(fake.calls[1]?.value).toMatchObject({
      action: 'IDENTITY_USER_DISABLED',
      targetId: row.id,
    });
    expect(fake.commits).toBe(2);
  });

  it('audit insert 실패 시 상태 변경 transaction을 commit하지 않는다', async () => {
    const fake = createDatabase([[{ ...row, status: 'DISABLED' }]], {
      failAuditAction: 'IDENTITY_USER_DISABLED',
    });
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(query.changeStatusWithAudit(statusChange)).rejects.toThrow(
      'audit failed',
    );
    expect(fake.commits).toBe(0);
  });

  it('beta 안내를 가입 gate가 아닌 append-only audit으로 기록한다', async () => {
    const invitationId = '00000000-0000-4000-8000-000000000003';
    const fake = createDatabase([[{ id: invitationId }]]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(
      query.recordInvitation({
        actorSub: 'admin-sub',
        email: 'new@hufs.ac.kr',
        invitedByUserId: '00000000-0000-4000-8000-000000000001',
        requestId: 'request-1',
        sentAt: now,
      }),
    ).resolves.toEqual({
      id: invitationId,
      email: 'new@hufs.ac.kr',
      invitedByUserId: '00000000-0000-4000-8000-000000000001',
      sentAt: now,
    });
    expect(fake.calls[0]?.value).toMatchObject({
      action: 'IDENTITY_BETA_INVITATION_RECORDED',
      target: 'new@hufs.ac.kr',
    });
  });
});
