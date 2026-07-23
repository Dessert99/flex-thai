/** 이메일 인증과 관리자 step-up이 공유하는 일회용 상태를 정의한다 */

/** 일회용 challenge의 terminal 전이를 포함한 상태 */
export type ChallengeStatus = 'PENDING' | 'SUCCEEDED' | 'EXPIRED' | 'CANCELLED';

/** 이메일 코드가 증명하려는 행위를 구분한다 */
export type AuthChallengePurpose = 'SIGNUP' | 'PASSWORD_RESET';

/** 비밀번호 없이 이메일 코드 HMAC만 보관하는 인증 challenge */
export interface AuthChallenge {
  id: string;
  email: string;
  purpose: AuthChallengePurpose;
  codeHmac: string;
  attempts: number;
  status: ChallengeStatus;
  expiresAt: Date;
  createdAt: Date;
}

/** Cognito 구현과 fake가 동일하게 반환하는 token 묶음 */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  subject: string;
  email: string;
}

/** 관리자 민감 작업 하나에만 유효한 SMS challenge */
export interface StepUpChallenge {
  id: string;
  userId: string;
  actionCategory: string;
  otpHmac: string;
  attempts: number;
  status: ChallengeStatus;
  expiresAt: Date;
}
