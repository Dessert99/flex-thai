/** 인증 domain이 DB·Cognito·메시지·암호 구현에 요구하는 port를 모은다 */
import type { ChallengeStatus, StepUpChallenge } from './challenge.js';

/** 일회용 코드 원문을 저장하지 않도록 HMAC만 제공한다 */
export interface ChallengeCryptoPort {
  hashAnswer(answer: string, salt?: Uint8Array): string;
  verifyAnswer(answer: string, stored: string): boolean;
}

/** 관리자 SMS OTP를 전송하는 provider port */
export interface SmsSender {
  sendOtp(phoneNumber: string, otp: string): Promise<void>;
}

/** Cognito access token으로 전화번호 등록·검증 상태를 다루는 port */
export interface VerifiedPhoneProvider {
  startVerification(accessToken: string, phoneNumber: string): Promise<void>;
  verify(accessToken: string, code: string): Promise<void>;
  getVerifiedPhoneNumber(accessToken: string): Promise<string>;
}

/** step-up challenge와 grant HMAC만 저장하는 repository port */
export interface StepUpRepository {
  createChallenge(input: {
    userId: string;
    actionCategory: string;
    otpHmac: string;
    expiresAt: Date;
  }): Promise<StepUpChallenge>;
  findChallengeById(challengeId: string): Promise<StepUpChallenge | null>;
  recordChallengeFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<StepUpChallenge | null>;
  transitionChallenge(
    challengeId: string,
    status: Extract<ChallengeStatus, 'SUCCEEDED' | 'EXPIRED'>,
  ): Promise<boolean>;
  createGrant(input: {
    userId: string;
    actionCategory: string;
    tokenHmac: string;
    expiresAt: Date;
  }): Promise<void>;
  findActiveGrants(
    userId: string,
    actionCategory: string,
    now: Date,
  ): Promise<
    Array<{ actionCategory: string; tokenHmac: string; expiresAt: Date }>
  >;
}
