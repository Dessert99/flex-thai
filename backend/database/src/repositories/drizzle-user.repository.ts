/** Cognito sub를 애플리케이션 사용자 role·status와 연결한다 */
import { eq } from 'drizzle-orm';
import type {
  ApplicationUser,
  IdentityUserRepository,
  UserRepository,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { users } from '../schema/index.js';
import * as schema from '../schema/index.js';

type UserDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type UserRow = typeof users.$inferSelect;

const toApplicationUser = (row: UserRow): ApplicationUser => ({
  id: row.id,
  cognitoSub: row.cognitoSub,
  email: row.email,
  role: row.role,
  status: row.status,
  phoneVerifiedAt: row.phoneVerifiedAt,
  mfaEnrolledAt: row.mfaEnrolledAt,
});

/** 변경 불가능한 Cognito sub를 unique key로 사용하는 Drizzle adapter */
export class DrizzleUserRepository
  implements UserRepository, IdentityUserRepository
{
  constructor(private readonly database: UserDatabase) {}

  /** authorizer가 검증한 sub의 최신 DB role과 상태를 읽는다 */
  async findBySub(subject: string): Promise<ApplicationUser | null> {
    const [row] = await this.database
      .select()
      .from(users)
      .where(eq(users.cognitoSub, subject))
      .limit(1);
    return row ? toApplicationUser(row) : null;
  }

  /** Cognito token 발급 뒤 sub 기준 identity를 생성하거나 email만 갱신한다 */
  async upsertIdentity(input: {
    subject: string;
    email: string;
  }): Promise<ApplicationUser> {
    const [row] = await this.database
      .insert(users)
      .values({ cognitoSub: input.subject, email: input.email })
      .onConflictDoUpdate({
        target: users.cognitoSub,
        set: { email: input.email, updatedAt: new Date() },
      })
      .returning();

    if (!row) {
      throw new Error('사용자 upsert 결과가 없습니다');
    }

    return toApplicationUser(row);
  }

  /** Cognito가 검증한 전화번호의 완료 시각만 애플리케이션 DB에 남긴다 */
  async markPhoneVerified(
    subject: string,
    verifiedAt: Date,
  ): Promise<ApplicationUser> {
    const [row] = await this.database
      .update(users)
      .set({ phoneVerifiedAt: verifiedAt, updatedAt: verifiedAt })
      .where(eq(users.cognitoSub, subject))
      .returning();

    if (!row) {
      throw new Error(`사용자를 찾을 수 없습니다: ${subject}`);
    }

    return toApplicationUser(row);
  }

  /** Cognito TOTP 확인 성공 시각을 사용자 상태에 반영한다 */
  async markMfaEnrolled(
    subject: string,
    enrolledAt: Date,
  ): Promise<ApplicationUser> {
    const [row] = await this.database
      .update(users)
      .set({ mfaEnrolledAt: enrolledAt, updatedAt: enrolledAt })
      .where(eq(users.cognitoSub, subject))
      .returning();

    if (!row) {
      throw new Error(`사용자를 찾을 수 없습니다: ${subject}`);
    }

    return toApplicationUser(row);
  }
}
