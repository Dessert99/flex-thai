/** 인증 domain이 DB·Cognito·메시지·암호 구현에 요구하는 port를 모은다 */
import type {
  AuthChallenge,
  AuthChallengePurpose,
  ChallengeStatus,
  StepUpChallenge,
  TokenSet,
} from './challenge.js';

/** 운영 중 재배포 없이 조절하는 이메일 challenge 상한 */
export interface ChallengeLimits {
  cooldownSeconds: number;
  perEmailPerDay: number;
  globalPerDay: number;
}

/** 원자적 생성이 성공했는지 어떤 상한에 막혔는지 표현한다 */
export type AuthChallengeCreation =
  | {
      kind: 'CREATED';
      challenge: AuthChallenge;
      globalLimitReached: boolean;
    }
  | { kind: 'COOLDOWN' | 'EMAIL_DAILY_LIMIT' | 'GLOBAL_DAILY_LIMIT' };

/** 발송 상한 검사와 challenge 생성을 한 원자적 연산으로 제공한다 */
export interface AuthChallengeRepository {
  createWithinLimits(input: {
    id: string;
    email: string;
    purpose: AuthChallengePurpose;
    codeHmac: string;
    expiresAt: Date;
    createdAt: Date;
    limits: ChallengeLimits;
  }): Promise<AuthChallengeCreation>;
  findById(challengeId: string): Promise<AuthChallenge | null>;
  recordFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<AuthChallenge | null>;
  transition(
    challengeId: string,
    status: Extract<ChallengeStatus, 'SUCCEEDED' | 'EXPIRED'>,
  ): Promise<boolean>;
}

/** 일회용 코드 원문을 저장하지 않도록 HMAC만 제공한다 */
export interface ChallengeCryptoPort {
  hashAnswer(answer: string, salt?: Uint8Array): string;
  verifyAnswer(answer: string, stored: string): boolean;
}

/** 비밀번호 원문을 애플리케이션 저장소에 남기지 않고 Cognito로 전달한다 */
export interface IdentityProvider {
  userExists(email: string): Promise<boolean>;
  createVerifiedUser(email: string, password: string): Promise<TokenSet>;
  login(email: string, password: string): Promise<TokenSet>;
  setPassword(email: string, newPassword: string): Promise<void>;
  refresh(refreshToken: string): Promise<TokenSet>;
  revoke(refreshToken: string): Promise<void>;
}

/** 6자리 코드 원문을 인증 대상 이메일로만 보낸다 */
export interface ChallengeSender {
  send(input: { email: string; code: string }): Promise<void>;
}

/** SSM 등 외부 설정에서 현재 발송 상한을 읽는다 */
export interface ChallengeLimitProvider {
  getLimits(): Promise<ChallengeLimits>;
}

/** Cognito 구현 세부 이름을 domain에 노출하지 않는 identity 오류 */
export class IdentityProviderError extends Error {
  constructor(readonly code: 'ACCOUNT_EXISTS' | 'INVALID_CREDENTIALS') {
    super(code);
    this.name = 'IdentityProviderError';
  }
}

/** 전체 상한 도달처럼 운영자가 확인할 보안 사건을 알린다 */
export interface SecurityAlert {
  globalChallengeLimitReached(limit: number): Promise<void>;
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
