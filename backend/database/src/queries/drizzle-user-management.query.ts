/** 관리자 사용자 검색·역할·상태와 audit 기반 beta 안내 추적 adapter를 정의한다 */
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';
import type {
  BetaInvitationRepository,
  IdentityUserManagementRepository,
  ManagedIdentityUser,
  ManagedIdentityUserChangeResult,
  ManagedIdentityUserListQuery,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditLogs, users } from '../schema/index.js';
import * as schema from '../schema/index.js';

type UserManagementDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type UserRow = typeof users.$inferSelect;

const toManagedUser = (row: UserRow): ManagedIdentityUser => ({
  id: row.id,
  cognitoSub: row.cognitoSub,
  email: row.email,
  role: row.role,
  status: row.status,
  mfaEnrolledAt: row.mfaEnrolledAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const ADMIN_MUTATION_LOCK_KEY = 'identity-user-admin-mutation';

/** 사용자 관리 read/write와 append-only audit을 제공하는 Drizzle adapter */
export class DrizzleUserManagementQuery
  implements IdentityUserManagementRepository, BetaInvitationRepository
{
  constructor(private readonly database: UserManagementDatabase) {}

  /** 검색 조건에 맞는 사용자를 stable 최신순 페이지로 반환한다 */
  async listManagedUsers(query: ManagedIdentityUserListQuery) {
    const escapedQuery = query.query?.replace(/[\\%_]/g, '\\$&');
    const condition = and(
      escapedQuery ? ilike(users.email, `%${escapedQuery}%`) : undefined,
      query.role ? eq(users.role, query.role) : undefined,
      query.status ? eq(users.status, query.status) : undefined,
      query.mfaEnrolled === true ? isNotNull(users.mfaEnrolledAt) : undefined,
      query.mfaEnrolled === false ? isNull(users.mfaEnrolledAt) : undefined,
    );
    const [{ total = 0 } = {}] = await this.database
      .select({ total: count(users.id) })
      .from(users)
      .where(condition);
    const rows = await this.database
      .select()
      .from(users)
      .where(condition)
      .orderBy(desc(users.updatedAt), desc(users.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map(toManagedUser),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** UUID 대상 상태 변경과 audit insert를 한 transaction에 둔다 */
  async changeStatusWithAudit(
    input: Parameters<
      IdentityUserManagementRepository['changeStatusWithAudit']
    >[0],
  ): Promise<ManagedIdentityUserChangeResult> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${ADMIN_MUTATION_LOCK_KEY}))`,
      );
      const [current] = await transaction
        .select()
        .from(users)
        .where(eq(users.id, input.userId));
      if (!current) return { kind: 'NOT_FOUND' };
      if (current.status === input.status) {
        return { kind: 'UNCHANGED', user: toManagedUser(current) };
      }
      if (current.id === input.actorUserId && input.status === 'DISABLED') {
        return { kind: 'SELF_LOCKOUT' };
      }
      if (
        current.role === 'ADMIN' &&
        current.status === 'ACTIVE' &&
        input.status === 'DISABLED'
      ) {
        const [{ total = 0 } = {}] = await transaction
          .select({ total: count(users.id) })
          .from(users)
          .where(
            and(
              eq(users.role, 'ADMIN'),
              eq(users.status, 'ACTIVE'),
              ne(users.id, current.id),
            ),
          );
        if (total === 0) return { kind: 'LAST_ACTIVE_ADMIN' };
      }
      const [updated] = await transaction
        .update(users)
        .set({ status: input.status, updatedAt: input.occurredAt })
        .where(eq(users.id, input.userId))
        .returning();
      if (!updated) return { kind: 'NOT_FOUND' };

      await transaction.insert(auditLogs).values({
        actorSub: input.actorSub,
        actorUserId: input.actorUserId,
        action:
          input.status === 'DISABLED'
            ? 'IDENTITY_USER_DISABLED'
            : 'IDENTITY_USER_ENABLED',
        target: `users/${input.userId}`,
        targetType: 'USER',
        targetId: input.userId,
        summary: {
          before: { status: current.status },
          after: { status: updated.status },
        },
        requestId: input.requestId,
        createdAt: input.occurredAt,
      });
      return { kind: 'UPDATED', user: toManagedUser(updated) };
    });
  }

  /** UUID 대상 역할 변경과 audit insert를 상태 변경과 같은 lock 아래 둔다 */
  async changeRoleWithAudit(
    input: Parameters<
      IdentityUserManagementRepository['changeRoleWithAudit']
    >[0],
  ): Promise<ManagedIdentityUserChangeResult> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${ADMIN_MUTATION_LOCK_KEY}))`,
      );
      const [current] = await transaction
        .select()
        .from(users)
        .where(eq(users.id, input.userId));
      if (!current) return { kind: 'NOT_FOUND' };
      if (current.role === input.role) {
        return { kind: 'UNCHANGED', user: toManagedUser(current) };
      }
      if (current.id === input.actorUserId && input.role === 'LEARNER') {
        return { kind: 'SELF_LOCKOUT' };
      }
      if (
        current.role === 'ADMIN' &&
        current.status === 'ACTIVE' &&
        input.role === 'LEARNER'
      ) {
        const [{ total = 0 } = {}] = await transaction
          .select({ total: count(users.id) })
          .from(users)
          .where(
            and(
              eq(users.role, 'ADMIN'),
              eq(users.status, 'ACTIVE'),
              ne(users.id, current.id),
            ),
          );
        if (total === 0) return { kind: 'LAST_ACTIVE_ADMIN' };
      }
      const [updated] = await transaction
        .update(users)
        .set({ role: input.role, updatedAt: input.occurredAt })
        .where(eq(users.id, input.userId))
        .returning();
      if (!updated) return { kind: 'NOT_FOUND' };

      await transaction.insert(auditLogs).values({
        actorSub: input.actorSub,
        actorUserId: input.actorUserId,
        action: 'IDENTITY_USER_ROLE_CHANGED',
        target: `users/${input.userId}`,
        targetType: 'USER',
        targetId: input.userId,
        summary: {
          before: { role: current.role },
          after: { role: updated.role },
        },
        requestId: input.requestId,
        createdAt: input.occurredAt,
      });
      return { kind: 'UPDATED', user: toManagedUser(updated) };
    });
  }

  /** beta 안내 발송을 가입 gate가 아닌 audit record로 저장한다 */
  async recordInvitation(
    input: Parameters<BetaInvitationRepository['recordInvitation']>[0],
  ) {
    const [row] = await this.database
      .insert(auditLogs)
      .values({
        actorSub: input.actorSub,
        actorUserId: input.invitedByUserId,
        action: 'IDENTITY_BETA_INVITATION_RECORDED',
        target: input.email,
        targetType: 'EMAIL',
        summary: {
          email: input.email,
          invitedByUserId: input.invitedByUserId,
          trackingOnly: true,
        },
        requestId: input.requestId,
        createdAt: input.sentAt,
      })
      .returning({ id: auditLogs.id });
    if (!row) {
      throw new Error('beta 안내 발송 기록 결과가 없습니다');
    }
    return {
      id: row.id,
      email: input.email,
      invitedByUserId: input.invitedByUserId,
      sentAt: input.sentAt,
    };
  }
}
