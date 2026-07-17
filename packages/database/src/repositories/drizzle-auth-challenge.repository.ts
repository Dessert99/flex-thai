/** passwordless challenge의 HMAC·암호문·terminal 전이를 Drizzle로 저장한다 */
import { and, eq, sql } from 'drizzle-orm';
import type {
  AuthChallenge,
  AuthChallengeRepository,
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
  codeHmac: row.codeHmac,
  linkHmac: row.linkHmac,
  sessionCiphertext: row.cognitoSessionCiphertext,
  attempts: row.attempts,
  status: row.status,
  expiresAt: row.expiresAt,
});

/** PENDING 조건을 모든 변경 query에 강제하는 passwordless repository */
export class DrizzleAuthChallengeRepository implements AuthChallengeRepository {
  constructor(private readonly database: AuthDatabase) {}

  /** trigger가 만든 답 HMAC과 10분 만료만 저장한다 */
  async create(input: {
    id: string;
    emailHash: string;
    codeHmac: string;
    linkHmac: string;
    expiresAt: Date;
  }): Promise<AuthChallenge> {
    const [row] = await this.database
      .insert(authChallenges)
      .values(input)
      .returning();

    if (!row) {
      throw new Error('Auth challenge 생성 결과가 없습니다');
    }

    return toAuthChallenge(row);
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

  /** PENDING row에만 Cognito session 암호문을 연결한다 */
  async attachSession(challengeId: string, ciphertext: string): Promise<void> {
    const updated = await this.database
      .update(authChallenges)
      .set({ cognitoSessionCiphertext: ciphertext })
      .where(
        and(
          eq(authChallenges.id, challengeId),
          eq(authChallenges.status, 'PENDING'),
        ),
      )
      .returning({ id: authChallenges.id });

    if (updated.length === 0) {
      throw new Error('PENDING auth challenge를 찾을 수 없습니다');
    }
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
