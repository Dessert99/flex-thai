/** passwordless 이메일 challenge 제한과 원자 소비를 Drizzle로 보장한다 */
import { and, eq, gt, gte, lt, sql } from 'drizzle-orm';
import {
  EmailChallengeError,
  type ChallengeCryptoPort,
  type EmailChallenge,
  type EmailChallengeRepository,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { authChallenges } from '../schema/index.js';
import * as schema from '../schema/index.js';

type EmailChallengeDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type EmailChallengeRow = typeof authChallenges.$inferSelect;

const toEmailChallenge = (row: EmailChallengeRow): EmailChallenge => ({
  id: row.id,
  email: row.email,
  expiresAt: row.expiresAt,
  resendAt: row.resendAt,
  attempts: row.attempts,
  status: row.status,
});

type ReservationResult =
  | { challenge: EmailChallenge }
  | { error: EmailChallengeError['code'] };

/** transaction advisory lock과 조건부 update를 사용하는 repository */
export class DrizzleEmailChallengeRepository
  implements EmailChallengeRepository
{
  constructor(
    private readonly database: EmailChallengeDatabase,
    private readonly crypto: ChallengeCryptoPort,
  ) {}

  /** cooldown과 두 일일 상한을 같은 transaction에서 확인하고 생성한다 */
  async createWithinLimits(
    input: Parameters<EmailChallengeRepository['createWithinLimits']>[0],
  ): Promise<EmailChallenge> {
    const result = await this.database.transaction(async (transaction) => {
      // 전체 count와 insert가 모든 API instance에서 같은 순서로 실행되게 한다.
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext('email_challenge_rate_limit'))`,
      );
      const cooldownSince = new Date(input.now.getTime() - 60_000);
      const dailySince = new Date(input.now.getTime() - 86_400_000);
      const [cooldown] = await transaction
        .select({ value: sql<number>`count(*)::int` })
        .from(authChallenges)
        .where(
          and(
            eq(authChallenges.email, input.email),
            gt(authChallenges.createdAt, cooldownSince),
          ),
        );
      if (Number(cooldown?.value ?? 0) > 0) {
        return { error: 'CHALLENGE_RESEND_COOLDOWN' as const };
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
      if (Number(emailDaily?.value ?? 0) >= input.limits.emailDaily) {
        return { error: 'EMAIL_DAILY_LIMIT_EXCEEDED' as const };
      }

      const [globalDaily] = await transaction
        .select({ value: sql<number>`count(*)::int` })
        .from(authChallenges)
        .where(gte(authChallenges.createdAt, dailySince));
      if (Number(globalDaily?.value ?? 0) >= input.limits.globalDaily) {
        return { error: 'GLOBAL_DAILY_LIMIT_EXCEEDED' as const };
      }

      const [row] = await transaction
        .insert(authChallenges)
        .values({
          email: input.email,
          purpose: 'LOGIN',
          codeHmac: input.codeHmac,
          linkHmac: input.linkHmac,
          expiresAt: input.expiresAt,
          resendAt: input.resendAt,
          createdAt: input.now,
        })
        .returning();
      if (!row) {
        throw new Error('이메일 challenge 생성 결과가 없습니다');
      }
      return { challenge: toEmailChallenge(row) };
    });

    if ('error' in result) {
      throw new EmailChallengeError(result.error);
    }
    return result.challenge;
  }

  /** 기존 PENDING을 만료시키고 새 challenge를 같은 transaction에서 만든다 */
  async replaceForResend(
    input: Parameters<EmailChallengeRepository['replaceForResend']>[0],
  ): Promise<EmailChallenge> {
    const result = await this.database.transaction(async (transaction) => {
      // limit count와 기존 행 교체가 다른 create·resend와 경쟁하지 않게 한다.
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext('email_challenge_rate_limit'))`,
      );
      const [previous] = await transaction
        .select()
        .from(authChallenges)
        .where(eq(authChallenges.id, input.challengeId))
        .limit(1);
      if (!previous) return { error: 'CHALLENGE_NOT_FOUND' as const };
      if (previous.status !== 'PENDING') {
        return {
          error:
            previous.status === 'SUCCEEDED'
              ? ('CHALLENGE_ALREADY_USED' as const)
              : ('CHALLENGE_EXPIRED' as const),
        };
      }
      if (previous.expiresAt <= input.now) {
        return { error: 'CHALLENGE_EXPIRED' as const };
      }
      if (previous.resendAt > input.now) {
        return { error: 'CHALLENGE_RESEND_COOLDOWN' as const };
      }

      const dailySince = new Date(input.now.getTime() - 86_400_000);
      const [emailDaily] = await transaction
        .select({ value: sql<number>`count(*)::int` })
        .from(authChallenges)
        .where(
          and(
            eq(authChallenges.email, previous.email),
            gte(authChallenges.createdAt, dailySince),
          ),
        );
      if (Number(emailDaily?.value ?? 0) >= input.limits.emailDaily) {
        return { error: 'EMAIL_DAILY_LIMIT_EXCEEDED' as const };
      }
      const [globalDaily] = await transaction
        .select({ value: sql<number>`count(*)::int` })
        .from(authChallenges)
        .where(gte(authChallenges.createdAt, dailySince));
      if (Number(globalDaily?.value ?? 0) >= input.limits.globalDaily) {
        return { error: 'GLOBAL_DAILY_LIMIT_EXCEEDED' as const };
      }

      const replaced = await transaction
        .update(authChallenges)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(authChallenges.id, input.challengeId),
            eq(authChallenges.status, 'PENDING'),
          ),
        )
        .returning({ id: authChallenges.id });
      if (replaced.length === 0) {
        return { error: 'CHALLENGE_IN_PROGRESS' as const };
      }

      const [replacement] = await transaction
        .insert(authChallenges)
        .values({
          email: previous.email,
          purpose: 'LOGIN',
          codeHmac: input.codeHmac,
          linkHmac: input.linkHmac,
          attempts: 0,
          status: 'PENDING',
          expiresAt: input.expiresAt,
          resendAt: input.resendAt,
          deliveryStatus: 'PENDING',
          createdAt: input.now,
        })
        .returning();
      if (!replacement) {
        throw new Error('재전송 challenge 생성 결과가 없습니다');
      }
      return { challenge: toEmailChallenge(replacement) };
    });

    if ('error' in result) {
      throw new EmailChallengeError(result.error);
    }
    return result.challenge;
  }

  /** SES 결과만 원문 없이 delivery 상태에 기록한다 */
  async markDelivery(
    challengeId: string,
    status: 'SENT' | 'FAILED',
  ): Promise<void> {
    await this.database
      .update(authChallenges)
      .set({ deliveryStatus: status })
      .where(eq(authChallenges.id, challengeId))
      .returning({ id: authChallenges.id });
  }

  /** 재전송 발송 실패 시 새 행을 만료하고 이전 PENDING 상태를 복구한다 */
  async restoreReplacedChallenge(input: {
    previousChallengeId: string;
    replacementChallengeId: string;
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.previousChallengeId}))`,
      );
      const expiredReplacement = await transaction
        .update(authChallenges)
        .set({ status: 'EXPIRED', deliveryStatus: 'FAILED' })
        .where(
          and(
            eq(authChallenges.id, input.replacementChallengeId),
            eq(authChallenges.status, 'PENDING'),
          ),
        )
        .returning({ id: authChallenges.id });
      if (expiredReplacement.length === 0) {
        return;
      }
      await transaction
        .update(authChallenges)
        .set({ status: 'PENDING' })
        .where(
          and(
            eq(authChallenges.id, input.previousChallengeId),
            eq(authChallenges.status, 'EXPIRED'),
          ),
        )
        .returning({ id: authChallenges.id });
    });
  }

  /** challenge별 lock 뒤 answer를 검증해 한 요청만 RESERVED로 전이한다 */
  async reserveConsumption(
    input: Parameters<EmailChallengeRepository['reserveConsumption']>[0],
  ): Promise<EmailChallenge> {
    const result: ReservationResult = await this.database.transaction(
      async (transaction) => {
        // 같은 challenge의 code와 link 경쟁을 DB transaction 순서로 직렬화한다.
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext(${input.challengeId}))`,
        );
        const [row] = await transaction
          .select()
          .from(authChallenges)
          .where(eq(authChallenges.id, input.challengeId))
          .limit(1);
        if (!row) return { error: 'CHALLENGE_NOT_FOUND' };
        if (row.status === 'RESERVED') {
          return { error: 'CHALLENGE_IN_PROGRESS' };
        }
        if (row.status === 'SUCCEEDED') {
          return { error: 'CHALLENGE_ALREADY_USED' };
        }
        if (row.status === 'EXPIRED' || row.expiresAt <= input.now) {
          await this.expireWithinTransaction(transaction, input.challengeId);
          return { error: 'CHALLENGE_EXPIRED' };
        }
        if (row.attempts >= 5) {
          await this.expireWithinTransaction(transaction, input.challengeId);
          return { error: 'CHALLENGE_ATTEMPTS_EXCEEDED' };
        }

        const stored =
          input.answer.kind === 'CODE' ? row.codeHmac : row.linkHmac;
        if (!this.crypto.verifyAnswer(input.answer.answer, stored)) {
          const attempts = row.attempts + 1;
          await transaction
            .update(authChallenges)
            .set({
              attempts,
              status: attempts >= 5 ? 'EXPIRED' : 'PENDING',
            })
            .where(
              and(
                eq(authChallenges.id, input.challengeId),
                eq(authChallenges.status, 'PENDING'),
              ),
            )
            .returning({ id: authChallenges.id });
          return {
            error:
              attempts >= 5
                ? 'CHALLENGE_ATTEMPTS_EXCEEDED'
                : 'INVALID_CHALLENGE_ANSWER',
          };
        }

        const [reserved] = await transaction
          .update(authChallenges)
          .set({ status: 'RESERVED', reservedAt: input.now })
          .where(
            and(
              eq(authChallenges.id, input.challengeId),
              eq(authChallenges.status, 'PENDING'),
              lt(authChallenges.attempts, 5),
              gt(authChallenges.expiresAt, input.now),
            ),
          )
          .returning();
        return reserved
          ? { challenge: toEmailChallenge(reserved) }
          : { error: 'CHALLENGE_IN_PROGRESS' };
      },
    );

    if ('error' in result) {
      throw new EmailChallengeError(result.error);
    }
    return result.challenge;
  }

  /** 예약된 challenge만 성공 terminal 상태로 완료한다 */
  async finalizeConsumption(challengeId: string, now: Date): Promise<void> {
    const rows = await this.database
      .update(authChallenges)
      .set({ status: 'SUCCEEDED', consumedAt: now })
      .where(
        and(
          eq(authChallenges.id, challengeId),
          eq(authChallenges.status, 'RESERVED'),
        ),
      )
      .returning({ id: authChallenges.id });
    if (rows.length === 0) {
      throw new EmailChallengeError('CHALLENGE_IN_PROGRESS');
    }
  }

  /** provider 실패 시 예약 상태만 다시 PENDING으로 되돌린다 */
  async releaseConsumption(challengeId: string): Promise<void> {
    await this.database
      .update(authChallenges)
      .set({ status: 'PENDING', reservedAt: null })
      .where(
        and(
          eq(authChallenges.id, challengeId),
          eq(authChallenges.status, 'RESERVED'),
        ),
      )
      .returning({ id: authChallenges.id });
  }

  private async expireWithinTransaction(
    transaction: Parameters<
      Parameters<EmailChallengeDatabase['transaction']>[0]
    >[0],
    challengeId: string,
  ): Promise<void> {
    await transaction
      .update(authChallenges)
      .set({ status: 'EXPIRED' })
      .where(
        and(
          eq(authChallenges.id, challengeId),
          eq(authChallenges.status, 'PENDING'),
        ),
      )
      .returning({ id: authChallenges.id });
  }
}
