/** DB 없이 이메일 인증과 step-up terminal 전이를 재현한다 */
import { randomUUID } from 'node:crypto';
import type {
  AuthChallenge,
  AuthChallengeCreation,
  AuthChallengePurpose,
  AuthChallengeRepository,
  ChallengeLimits,
  ChallengeStatus,
  StepUpChallenge,
  StepUpRepository,
} from '@flex-thia/domain';

/** 발송 상한과 PENDING 전이를 메모리에서 재현하는 fake repository */
export class FakeAuthChallengeRepository implements AuthChallengeRepository {
  private readonly challenges = new Map<string, AuthChallenge>();

  /** production repository와 같은 최근 60초·24시간 상한을 적용한다 */
  createWithinLimits(input: {
    id: string;
    email: string;
    purpose: AuthChallengePurpose;
    codeHmac: string;
    expiresAt: Date;
    createdAt: Date;
    limits: ChallengeLimits;
  }): Promise<AuthChallengeCreation> {
    const dailySince = input.createdAt.getTime() - 24 * 60 * 60 * 1000;
    const existing = [...this.challenges.values()].filter(
      (challenge) => challenge.createdAt.getTime() >= dailySince,
    );
    const byEmail = existing.filter(
      (challenge) => challenge.email === input.email,
    );
    const last = byEmail.at(-1);
    if (
      last &&
      input.createdAt.getTime() - last.createdAt.getTime() <
        input.limits.cooldownSeconds * 1000
    ) {
      return Promise.resolve({ kind: 'COOLDOWN' });
    }
    if (byEmail.length >= input.limits.perEmailPerDay) {
      return Promise.resolve({ kind: 'EMAIL_DAILY_LIMIT' });
    }
    if (existing.length >= input.limits.globalPerDay) {
      return Promise.resolve({ kind: 'GLOBAL_DAILY_LIMIT' });
    }

    const challenge: AuthChallenge = {
      id: input.id,
      email: input.email,
      purpose: input.purpose,
      codeHmac: input.codeHmac,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt,
      attempts: 0,
      status: 'PENDING',
    };
    this.challenges.set(challenge.id, challenge);
    return Promise.resolve({
      kind: 'CREATED',
      challenge,
      globalLimitReached: existing.length + 1 === input.limits.globalPerDay,
    });
  }

  /** challenge id로 현재 상태를 조회한다 */
  findById(challengeId: string): Promise<AuthChallenge | null> {
    return Promise.resolve(this.challenges.get(challengeId) ?? null);
  }

  /** 최대 횟수에 도달한 오답은 즉시 CANCELLED로 전이한다 */
  recordFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<AuthChallenge | null> {
    const challenge = this.challenges.get(challengeId);

    if (!challenge || challenge.status !== 'PENDING') {
      return Promise.resolve(challenge ?? null);
    }

    const attempts = challenge.attempts + 1;
    const updated: AuthChallenge = {
      ...challenge,
      attempts,
      status: attempts >= maxAttempts ? 'CANCELLED' : 'PENDING',
    };
    this.challenges.set(challengeId, updated);
    return Promise.resolve(updated);
  }

  /** terminal row를 되돌리지 않고 첫 성공이나 만료만 반영한다 */
  transition(
    challengeId: string,
    status: Extract<ChallengeStatus, 'SUCCEEDED' | 'EXPIRED'>,
  ): Promise<boolean> {
    const challenge = this.challenges.get(challengeId);

    if (!challenge || challenge.status !== 'PENDING') {
      return Promise.resolve(false);
    }

    this.challenges.set(challengeId, { ...challenge, status });
    return Promise.resolve(true);
  }
}

/** OTP와 grant token 원문 없이 step-up 흐름을 재현하는 fake repository */
export class FakeStepUpRepository implements StepUpRepository {
  private readonly challenges = new Map<string, StepUpChallenge>();
  readonly grants: Array<{
    userId: string;
    actionCategory: string;
    tokenHmac: string;
    expiresAt: Date;
  }> = [];

  /** HMAC과 만료만 가진 PENDING step-up challenge를 만든다 */
  createChallenge(input: {
    userId: string;
    actionCategory: string;
    otpHmac: string;
    expiresAt: Date;
  }): Promise<StepUpChallenge> {
    const challenge: StepUpChallenge = {
      id: randomUUID(),
      ...input,
      attempts: 0,
      status: 'PENDING',
    };
    this.challenges.set(challenge.id, challenge);
    return Promise.resolve(challenge);
  }

  /** 관리자 challenge 현재 상태를 id로 조회한다 */
  findChallengeById(challengeId: string): Promise<StepUpChallenge | null> {
    return Promise.resolve(this.challenges.get(challengeId) ?? null);
  }

  /** 최대 오답 횟수에 도달하면 같은 OTP 재사용을 막는다 */
  recordChallengeFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<StepUpChallenge | null> {
    const challenge = this.challenges.get(challengeId);

    if (!challenge || challenge.status !== 'PENDING') {
      return Promise.resolve(challenge ?? null);
    }

    const attempts = challenge.attempts + 1;
    const updated: StepUpChallenge = {
      ...challenge,
      attempts,
      status: attempts >= maxAttempts ? 'CANCELLED' : 'PENDING',
    };
    this.challenges.set(challengeId, updated);
    return Promise.resolve(updated);
  }

  /** PENDING step-up만 성공이나 만료 terminal 상태로 바꾼다 */
  transitionChallenge(
    challengeId: string,
    status: Extract<ChallengeStatus, 'SUCCEEDED' | 'EXPIRED'>,
  ): Promise<boolean> {
    const challenge = this.challenges.get(challengeId);

    if (!challenge || challenge.status !== 'PENDING') {
      return Promise.resolve(false);
    }

    this.challenges.set(challengeId, { ...challenge, status });
    return Promise.resolve(true);
  }

  /** raw token 대신 action-scoped grant HMAC만 기록한다 */
  createGrant(input: {
    userId: string;
    actionCategory: string;
    tokenHmac: string;
    expiresAt: Date;
  }): Promise<void> {
    this.grants.push({ ...input });
    return Promise.resolve();
  }

  /** 사용자·action·현재 시각에 맞는 grant HMAC만 반환한다 */
  findActiveGrants(
    userId: string,
    actionCategory: string,
    now: Date,
  ): Promise<
    Array<{
      actionCategory: string;
      tokenHmac: string;
      expiresAt: Date;
    }>
  > {
    return Promise.resolve(
      this.grants.filter(
        (grant) =>
          grant.userId === userId &&
          grant.actionCategory === actionCategory &&
          grant.expiresAt.getTime() > now.getTime(),
      ),
    );
  }
}
