/** 이메일 challenge 생성 제한과 원자 소비를 persistence port로 정의한다 */
import type { EmailChallenge } from './email-challenge.js';

/** provider 호출의 소유권을 reservedAt으로 식별하는 challenge */
export interface ReservedEmailChallenge extends EmailChallenge {
  reservedAt: Date;
}

/** challenge 원자 소비 수단 */
export type EmailChallengeAnswer =
  { kind: 'CODE'; answer: string } | { kind: 'LINK'; answer: string };

/** 이메일 challenge persistence port */
export interface EmailChallengeRepository {
  createWithinLimits(input: {
    email: string;
    codeHmac: string;
    linkHmac: string;
    expiresAt: Date;
    resendAt: Date;
    now: Date;
    limits: {
      emailDaily: 5;
      globalDaily: 500;
      maxAttempts: 5;
    };
  }): Promise<EmailChallenge>;
  replaceForResend(input: {
    challengeId: string;
    codeHmac: string;
    linkHmac: string;
    expiresAt: Date;
    resendAt: Date;
    now: Date;
    limits: {
      emailDaily: 5;
      globalDaily: 500;
      maxAttempts: 5;
    };
  }): Promise<EmailChallenge>;
  markDelivery(challengeId: string, status: 'SENT' | 'FAILED'): Promise<void>;
  restoreReplacedChallenge(input: {
    previousChallengeId: string;
    replacementChallengeId: string;
  }): Promise<void>;
  reserveConsumption(input: {
    challengeId: string;
    answer: EmailChallengeAnswer;
    now: Date;
  }): Promise<ReservedEmailChallenge>;
  finalizeConsumption(
    challengeId: string,
    reservedAt: Date,
    now: Date,
  ): Promise<void>;
  releaseConsumption(challengeId: string, reservedAt: Date): Promise<void>;
}
