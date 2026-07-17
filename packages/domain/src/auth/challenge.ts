/** passwordless와 관리자 step-up이 공유하는 일회용 상태를 정의한다 */

/** 일회용 challenge의 terminal 전이를 포함한 상태 */
export type ChallengeStatus = 'PENDING' | 'SUCCEEDED' | 'EXPIRED' | 'CANCELLED';

/** 숫자 code와 이메일 link token을 구분한다 */
export type ChallengeAnswerKind = 'CODE' | 'LINK';

/** 원문 답과 session을 노출하지 않는 passwordless challenge */
export interface AuthChallenge {
  id: string;
  codeHmac: string;
  linkHmac: string;
  sessionCiphertext: string | null;
  attempts: number;
  status: ChallengeStatus;
  expiresAt: Date;
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
