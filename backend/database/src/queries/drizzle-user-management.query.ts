/** 관리자 사용자 목록·상태와 audit 기반 beta 안내 추적 adapter를 정의한다 */
import { asc, eq } from 'drizzle-orm';
import type {
  BetaInvitationRepository,
  IdentityUserManagementRepository,
  ManagedIdentityUser,
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

/** 사용자 관리 read/write와 append-only audit을 제공하는 Drizzle adapter */
export class DrizzleUserManagementQuery
  implements IdentityUserManagementRepository, BetaInvitationRepository
{
  constructor(private readonly database: UserManagementDatabase) {}

  /** 이메일 stable 순서로 관리 가능한 사용자 공개 신원을 반환한다 */
  async listManagedUsers(): Promise<ManagedIdentityUser[]> {
    const rows = await this.database
      .select()
      .from(users)
      .orderBy(asc(users.email));
    return rows.map(toManagedUser);
  }

  /** UUID 대상 상태 변경과 audit insert를 한 transaction에 둔다 */
  async changeStatusWithAudit(
    input: Parameters<
      IdentityUserManagementRepository['changeStatusWithAudit']
    >[0],
  ): Promise<ManagedIdentityUser | null> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .update(users)
        .set({ status: input.status, updatedAt: input.occurredAt })
        .where(eq(users.id, input.userId))
        .returning();
      if (!row) return null;

      await transaction.insert(auditLogs).values({
        actorSub: input.actorSub,
        actorUserId: input.actorUserId,
        action: input.action,
        target: `users/${input.userId}`,
        targetType: 'USER',
        targetId: input.userId,
        summary: { status: input.status },
        requestId: input.requestId,
        createdAt: input.occurredAt,
      });
      return toManagedUser(row);
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
