/** 이메일 challenge 상한과 terminal 전이를 Drizzle로 원자적으로 저장한다 */
import { and, eq, gte, sql } from 'drizzle-orm';
import type {
  AuthChallenge,
  AuthChallengeCreation,
  AuthChallengePurpose,
  AuthChallengeRepository,
  ChallengeLimits,
  ChallengeStatus,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { authChallenges } from '../schema/index.js';
import * as schema from '../schema/index.js';

type AuthDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type AuthChallengeRow = typeof authChallenges.$inferSelect;

const toAuthChallenge = (row: AuthChallengeRow): AuthChallenge => ({
  id: row.id,
  email: row.email,
  purpose: row.purpose,
  codeHmac: row.codeHmac,
  attempts: row.attempts,
  status: row.status,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
});

/** 동시 요청도 전체 발송 상한을 넘지 못하게 transaction lock으로 직렬화한다 */
export class DrizzleAuthChallengeRepository implements AuthChallengeRepository {
  constructor(private readonly database: AuthDatabase) {}

  /** 최근 60초·24시간 상한을 확인한 transaction 안에서만 challenge를 만든다 */
  createWithinLimits(input: {
    id: string;
    email: string;
    purpose: AuthChallengePurpose;
    codeHmac: string;
    expiresAt: Date;
    createdAt: Date;
    limits: ChallengeLimits;
  }): Promise<AuthChallengeCreation> {
    return this.database.transaction(async (transaction) => {
      // 모든 API instance가 같은 lock을 잡아 count와 insert 사이 경쟁을 막는다.
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext('auth_challenges_rate_limit'))`,
      );
      const cooldownSince = new Date(
        input.createdAt.getTime() - input.limits.cooldownSeconds * 1000,
      );
      const dailySince = new Date(
        input.createdAt.getTime() - 24 * 60 * 60 * 1000,
      );
      const [cooldown] = await transaction
        .select({ value: sql<number>`count(*)::int` })
        .from(authChallenges)
        .where(
          and(
            eq(authChallenges.email, input.email),
            gte(authChallenges.createdAt, cooldownSince),
          ),
        );
      if (Number(cooldown?.value ?? 0) > 0) {
        return { kind: 'COOLDOWN' as const };
      }

      const [emailDaily] = await transaction
        .select({ value: sql<number>`count(*)::int` })
        .from(authChallenges)
        .where(
          and(
            eq(authChallenges.email, input.email),
            gte(authChallenges.createdAt, dailySince),
          ),
        );
      if (Number(emailDaily?.value ?? 0) >= input.limits.perEmailPerDay) {
        return { kind: 'EMAIL_DAILY_LIMIT' as const };
      }

      const [globalDaily] = await transaction
        .select({ value: sql<number>`count(*)::int` })
        .from(authChallenges)
        .where(gte(authChallenges.createdAt, dailySince));
      const globalCount = Number(globalDaily?.value ?? 0);
      if (globalCount >= input.limits.globalPerDay) {
        return { kind: 'GLOBAL_DAILY_LIMIT' as const };
      }

      const [row] = await transaction
        .insert(authChallenges)
        .values({
          id: input.id,
          email: input.email,
          purpose: input.purpose,
          codeHmac: input.codeHmac,
          expiresAt: input.expiresAt,
          createdAt: input.createdAt,
        })
        .returning();
      if (!row) {
        throw new Error('Auth challenge 생성 결과가 없습니다');
      }
      return {
        kind: 'CREATED' as const,
        challenge: toAuthChallenge(row),
        globalLimitReached: globalCount + 1 === input.limits.globalPerDay,
      };
    });
  }

  /** challenge id로 HMAC과 terminal 상태를 조회한다 */
  async findById(challengeId: string): Promise<AuthChallenge | null> {
    const [row] = await this.database
      .select()
      .from(authChallenges)
      .where(eq(authChallenges.id, challengeId))
      .limit(1);
    return row ? toAuthChallenge(row) : null;
  }

  /** 오답 횟수를 원자적으로 올리고 최대 횟수면 CANCELLED로 바꾼다 */
  async recordFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<AuthChallenge | null> {
    const [row] = await this.database
      .update(authChallenges)
      .set({
        attempts: sql`${authChallenges.attempts} + 1`,
        status: sql`case when ${authChallenges.attempts} + 1 >= ${maxAttempts} then 'CANCELLED'::challenge_status else ${authChallenges.status} end`,
      })
      .where(
        and(
          eq(authChallenges.id, challengeId),
          eq(authChallenges.status, 'PENDING'),
        ),
      )
      .returning();
    return row ? toAuthChallenge(row) : this.findById(challengeId);
  }

  /** PENDING row만 첫 성공 또는 만료 terminal 상태로 전이한다 */
  async transition(
    challengeId: string,
    status: Extract<ChallengeStatus, 'SUCCEEDED' | 'EXPIRED'>,
  ): Promise<boolean> {
    const updated = await this.database
      .update(authChallenges)
      .set({ status })
      .where(
        and(
          eq(authChallenges.id, challengeId),
          eq(authChallenges.status, 'PENDING'),
        ),
      )
      .returning({ id: authChallenges.id });
    return updated.length > 0;
  }
}
