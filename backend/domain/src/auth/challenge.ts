/** 관리자 step-up이 사용하는 일회용 상태를 정의한다 */

/** 일회용 challenge의 terminal 전이를 포함한 상태 */
export type ChallengeStatus = 'PENDING' | 'SUCCEEDED' | 'EXPIRED' | 'CANCELLED';

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
