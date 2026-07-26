/** 이메일 challenge 생성 제한과 원자 소비를 persistence port로 정의한다 */
import type { EmailChallenge } from './email-challenge.js';

/** challenge 원자 소비 수단 */
export type EmailChallengeAnswer =
  | { kind: 'CODE'; answer: string }
  | { kind: 'LINK'; answer: string };

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
  reserveConsumption(input: {
    challengeId: string;
    answer: EmailChallengeAnswer;
    now: Date;
  }): Promise<EmailChallenge>;
  finalizeConsumption(challengeId: string, now: Date): Promise<void>;
  releaseConsumption(challengeId: string): Promise<void>;
}
