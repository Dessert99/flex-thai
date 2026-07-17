/** 최초 ADMIN role 변경과 audit log를 한 Drizzle transaction에 묶는다 */
import { eq } from 'drizzle-orm';
import type { AdminBootstrapRepository } from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditLogs, users } from '../schema/index.js';
import * as schema from '../schema/index.js';

type BootstrapDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** exact Cognito sub 하나만 ADMIN으로 바꾸고 SYSTEM_BOOTSTRAP audit을 남긴다 */
export class DrizzleAdminBootstrapRepository implements AdminBootstrapRepository {
  constructor(private readonly database: BootstrapDatabase) {}

  /** 다른 ADMIN이 있거나 대상이 없으면 role 변경을 확정하지 않는다 */
  async bootstrapAdmin(subject: string, requestId: string): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [target] = await transaction
        .select()
        .from(users)
        .where(eq(users.cognitoSub, subject))
        .limit(1);

      if (!target) {
        throw new Error(`Cognito sub 사용자를 찾을 수 없습니다: ${subject}`);
      }

      const [existingAdmin] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'ADMIN'))
        .limit(1);

      if (existingAdmin && existingAdmin.id !== target.id) {
        throw new Error('bootstrap-admin이 이미 다른 사용자에게 사용됐습니다');
      }

      if (target.role === 'ADMIN') {
        return;
      }

      await transaction
        .update(users)
        .set({ role: 'ADMIN', updatedAt: new Date() })
        .where(eq(users.id, target.id));
      await transaction.insert(auditLogs).values({
        actorSub: 'SYSTEM_BOOTSTRAP',
        action: 'ROLE_BOOTSTRAPPED',
        target: target.id,
        summary: { subject },
        requestId,
      });
    });
  }
}
