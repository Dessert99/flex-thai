/** 인증 domain이 DB·Cognito·SMS·암호 구현에 요구하는 port를 모은다 */
import type {
  AuthChallenge,
  ChallengeStatus,
  StepUpChallenge,
  TokenSet,
} from './challenge.js';

/** passwordless challenge 상태를 원자적으로 전이하는 repository port */
export interface AuthChallengeRepository {
  create(input: {
    id: string;
    emailHash: string;
    codeHmac: string;
    linkHmac: string;
    expiresAt: Date;
  }): Promise<AuthChallenge>;
  findById(challengeId: string): Promise<AuthChallenge | null>;
  attachSession(challengeId: string, ciphertext: string): Promise<void>;
  recordFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<AuthChallenge | null>;
  transition(
    challengeId: string,
    status: Extract<ChallengeStatus, 'SUCCEEDED' | 'EXPIRED'>,
  ): Promise<boolean>;
}

/** 원문 답과 Cognito session 보호를 domain에 제공하는 crypto port */
export interface ChallengeCryptoPort {
  hashAnswer(answer: string, salt?: Uint8Array): string;
  verifyAnswer(answer: string, stored: string): boolean;
  encryptSession(value: string): string;
  decryptSession(value: string): string;
}

/** Cognito custom auth 흐름을 domain 명령으로 감싼 identity port */
export interface IdentityProvider {
  ensureUser(email: string): Promise<void>;
  start(email: string): Promise<{ challengeId: string; session: string }>;
  respond(input: {
    challengeId: string;
    kind: 'CODE' | 'LINK';
    answer: string;
    session: string;
    username: string;
  }): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  revoke(refreshToken: string): Promise<void>;
}

/** 관리자 SMS OTP를 전송하는 provider port */
export interface SmsSender {
  sendOtp(phoneNumber: string, otp: string): Promise<void>;
}

/** code와 link token 원문을 일회성 이메일로 보내는 provider port */
export interface ChallengeSender {
  send(input: {
    email: string;
    challengeId: string;
    code: string;
    linkToken: string;
  }): Promise<void>;
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
    Array<{
      actionCategory: string;
      tokenHmac: string;
      expiresAt: Date;
    }>
  >;
}
