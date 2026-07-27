/** 관리자 사용자 검색과 원자적 역할·상태 변경 adapter를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { auditLogs } from '../schema/index.js';
import { DrizzleUserManagementQuery } from './drizzle-user-management.query.js';

const now = new Date('2026-07-26T00:00:00.000Z');
const actorUserId = '00000000-0000-4000-8000-000000000001';
const row = {
  id: '00000000-0000-4000-8000-000000000002',
  cognitoSub: 'learner-sub',
  email: 'learner@hufs.ac.kr',
  role: 'LEARNER',
  status: 'ACTIVE',
  mfaEnrolledAt: new Date('2026-07-20T00:00:00.000Z'),
  createdAt: now,
  updatedAt: now,
} as const;
const activeActor = {
  ...row,
  id: actorUserId,
  cognitoSub: 'admin-sub',
  email: 'admin@hufs.ac.kr',
  role: 'ADMIN',
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
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(consume),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (error: unknown) => unknown,
      ) => consume().then(resolve, reject),
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
  const execute = vi.fn(() => {
    calls.push({ operation: 'lock' });
    return Promise.resolve([]);
  });
  const transaction = vi.fn(
    async (
      operation: (transaction: {
        execute: typeof execute;
        insert: typeof insert;
        select: typeof select;
        update: typeof update;
      }) => Promise<unknown>,
    ) => {
      const result = await operation({ execute, insert, select, update });
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
  actorSub: 'admin-sub',
  actorUserId,
  occurredAt: now,
  requestId: 'request-1',
  status: 'DISABLED',
  userId: row.id,
} as const;

describe('DrizzleUserManagementQuery', () => {
  it('검색·역할·상태·MFA 조건과 stable 페이지 결과를 반환한다', async () => {
    const fake = createDatabase([[{ total: 21 }], [row]]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(
      query.listManagedUsers({
        query: 'learner',
        role: 'LEARNER',
        status: 'ACTIVE',
        mfaEnrolled: true,
        page: 2,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      items: [row],
      page: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
    });

    expect(
      fake.calls.filter(({ operation }) => operation === 'select'),
    ).toHaveLength(2);
  });

  it('상태 변경을 lock·조회·수정·audit 순서로 한 transaction에 저장한다', async () => {
    const fake = createDatabase([
      [activeActor],
      [row],
      [{ ...row, status: 'DISABLED' }],
      [],
    ]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(query.changeStatusWithAudit(statusChange)).resolves.toEqual({
      kind: 'UPDATED',
      user: { ...row, status: 'DISABLED' },
    });

    expect(fake.calls.map(({ operation }) => operation)).toEqual([
      'lock',
      'select',
      'select',
      'update',
      'insert',
    ]);
    expect(fake.calls.at(-1)?.value).toMatchObject({
      action: 'IDENTITY_USER_DISABLED',
      summary: { before: { status: 'ACTIVE' }, after: { status: 'DISABLED' } },
    });
  });

  it('동일 상태는 updatedAt과 audit을 건드리지 않는 성공 no-op이다', async () => {
    const disabled = { ...row, status: 'DISABLED' } as const;
    const fake = createDatabase([[activeActor], [disabled]]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(query.changeStatusWithAudit(statusChange)).resolves.toEqual({
      kind: 'UNCHANGED',
      user: disabled,
    });
    expect(fake.calls.map(({ operation }) => operation)).toEqual([
      'lock',
      'select',
      'select',
    ]);
  });

  it('자기 disable과 자기 demote를 차단한다', async () => {
    const admin = { ...row, id: actorUserId, role: 'ADMIN' } as const;
    const fake = createDatabase([
      [activeActor],
      [admin],
      [activeActor],
      [admin],
    ]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(
      query.changeStatusWithAudit({ ...statusChange, userId: actorUserId }),
    ).resolves.toEqual({ kind: 'SELF_LOCKOUT' });
    await expect(
      query.changeRoleWithAudit({
        ...statusChange,
        userId: actorUserId,
        role: 'LEARNER',
      }),
    ).resolves.toEqual({ kind: 'SELF_LOCKOUT' });
  });

  it.each([
    { ...activeActor, status: 'DISABLED' },
    { ...activeActor, role: 'LEARNER' },
    { ...activeActor, mfaEnrolledAt: null },
  ] as const)(
    'lock 뒤 최신 actor가 권한 조건을 잃은 경우 %# 변경을 차단한다',
    async (unauthorizedActor) => {
      const fake = createDatabase([[unauthorizedActor]]);
      const query = new DrizzleUserManagementQuery(fake.database as never);

      await expect(query.changeStatusWithAudit(statusChange)).resolves.toEqual({
        kind: 'ACTOR_FORBIDDEN',
      });
      expect(fake.calls.map(({ operation }) => operation)).toEqual([
        'lock',
        'select',
      ]);
    },
  );

  it('마지막 active admin의 제거를 차단한다', async () => {
    const admin = { ...row, role: 'ADMIN' } as const;
    const fake = createDatabase([
      [activeActor],
      [admin],
      [{ total: 0 }],
      [activeActor],
      [admin],
      [{ total: 0 }],
    ]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(query.changeStatusWithAudit(statusChange)).resolves.toEqual({
      kind: 'LAST_ACTIVE_ADMIN',
    });
    await expect(
      query.changeRoleWithAudit({ ...statusChange, role: 'LEARNER' }),
    ).resolves.toEqual({ kind: 'LAST_ACTIVE_ADMIN' });
  });

  it('역할 변경은 MFA 등록 시각을 보존하고 before/after audit을 남긴다', async () => {
    const fake = createDatabase([
      [activeActor],
      [row],
      [{ ...row, role: 'ADMIN' }],
      [],
    ]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(
      query.changeRoleWithAudit({ ...statusChange, role: 'ADMIN' }),
    ).resolves.toEqual({
      kind: 'UPDATED',
      user: { ...row, role: 'ADMIN' },
    });
    expect(
      fake.calls.find(({ operation }) => operation === 'update')?.value,
    ).toEqual({
      role: 'ADMIN',
      updatedAt: now,
    });
    expect(fake.calls.at(-1)?.value).toMatchObject({
      action: 'IDENTITY_USER_ROLE_CHANGED',
      summary: { before: { role: 'LEARNER' }, after: { role: 'ADMIN' } },
    });
  });

  it('대상이 없으면 변경 없이 NOT_FOUND를 반환한다', async () => {
    const fake = createDatabase([[activeActor], []]);
    const query = new DrizzleUserManagementQuery(fake.database as never);

    await expect(query.changeStatusWithAudit(statusChange)).resolves.toEqual({
      kind: 'NOT_FOUND',
    });
  });

  it('audit insert 실패 시 사용자 변경 transaction을 commit하지 않는다', async () => {
    const fake = createDatabase(
      [[activeActor], [row], [{ ...row, status: 'DISABLED' }]],
      {
        failAuditAction: 'IDENTITY_USER_DISABLED',
      },
    );
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
        invitedByUserId: actorUserId,
        requestId: 'request-1',
        sentAt: now,
      }),
    ).resolves.toMatchObject({ id: invitationId, email: 'new@hufs.ac.kr' });
    expect(fake.calls[0]).toMatchObject({
      operation: 'insert',
      table: auditLogs,
    });
  });
});
