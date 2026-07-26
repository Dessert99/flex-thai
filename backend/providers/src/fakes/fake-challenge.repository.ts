/** DB 없이 step-up terminal 전이를 재현한다 */
import { randomUUID } from 'node:crypto';
import type {
  ChallengeStatus,
  StepUpChallenge,
  StepUpRepository,
} from '@flex-thia/domain';

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
