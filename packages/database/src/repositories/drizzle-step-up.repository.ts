/** 관리자 step-up OTP와 action grant HMAC만 Drizzle로 저장한다 */
import { and, eq, sql } from 'drizzle-orm';
import type {
  ChallengeStatus,
  StepUpChallenge,
  StepUpRepository,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { stepUpChallenges, stepUpGrants } from '../schema/index.js';
import * as schema from '../schema/index.js';

type StepUpDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type StepUpRow = typeof stepUpChallenges.$inferSelect;

const toStepUpChallenge = (row: StepUpRow): StepUpChallenge => ({
  id: row.id,
  userId: row.userId,
  actionCategory: row.actionCategory,
  otpHmac: row.otpHmac,
  attempts: row.attempts,
  status: row.status,
  expiresAt: row.expiresAt,
});

/** PENDING step-up과 raw token 없는 grant만 다루는 Drizzle adapter */
export class DrizzleStepUpRepository implements StepUpRepository {
  constructor(private readonly database: StepUpDatabase) {}

  /** raw OTP 없이 HMAC과 action category만 저장한다 */
  async createChallenge(input: {
    userId: string;
    actionCategory: string;
    otpHmac: string;
    expiresAt: Date;
  }): Promise<StepUpChallenge> {
    const [row] = await this.database
      .insert(stepUpChallenges)
      .values(input)
      .returning();

    if (!row) {
      throw new Error('Step-up challenge 생성 결과가 없습니다');
    }

    return toStepUpChallenge(row);
  }

  /** step-up challenge 현재 상태를 id로 조회한다 */
  async findChallengeById(
    challengeId: string,
  ): Promise<StepUpChallenge | null> {
    const [row] = await this.database
      .select()
      .from(stepUpChallenges)
      .where(eq(stepUpChallenges.id, challengeId))
      .limit(1);
    return row ? toStepUpChallenge(row) : null;
  }

  /** 오답 횟수를 원자적으로 올리고 최대 횟수면 CANCELLED로 바꾼다 */
  async recordChallengeFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<StepUpChallenge | null> {
    const [row] = await this.database
      .update(stepUpChallenges)
      .set({
        attempts: sql`${stepUpChallenges.attempts} + 1`,
        status: sql`case when ${stepUpChallenges.attempts} + 1 >= ${maxAttempts} then 'CANCELLED'::challenge_status else ${stepUpChallenges.status} end`,
      })
      .where(
        and(
          eq(stepUpChallenges.id, challengeId),
          eq(stepUpChallenges.status, 'PENDING'),
        ),
      )
      .returning();

    return row ? toStepUpChallenge(row) : this.findChallengeById(challengeId);
  }

  /** PENDING step-up만 성공 또는 만료 terminal 상태로 바꾼다 */
  async transitionChallenge(
    challengeId: string,
    status: Extract<ChallengeStatus, 'SUCCEEDED' | 'EXPIRED'>,
  ): Promise<boolean> {
    const updated = await this.database
      .update(stepUpChallenges)
      .set({ status })
      .where(
        and(
          eq(stepUpChallenges.id, challengeId),
          eq(stepUpChallenges.status, 'PENDING'),
        ),
      )
      .returning({ id: stepUpChallenges.id });
    return updated.length > 0;
  }

  /** raw grant token 없이 HMAC과 10분 만료만 저장한다 */
  async createGrant(input: {
    userId: string;
    actionCategory: string;
    tokenHmac: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.insert(stepUpGrants).values(input);
  }
}
