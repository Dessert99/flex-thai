/** 비밀번호 없는 이메일 challenge의 상태와 공개 오류를 정의한다 */

/** 이메일 challenge 처리 상태 */
export type EmailChallengeStatus =
  | 'PENDING'
  | 'RESERVED'
  | 'SUCCEEDED'
  | 'EXPIRED';

/** persistence와 use case가 공유하는 이메일 challenge */
export interface EmailChallenge {
  id: string;
  email: string;
  expiresAt: Date;
  resendAt: Date;
  attempts: number;
  status: EmailChallengeStatus;
}

/** 호출자에게 안정적으로 노출할 이메일 challenge 오류 */
export class EmailChallengeError extends Error {
  constructor(
    readonly code:
      | 'INVALID_SCHOOL_EMAIL'
      | 'CHALLENGE_NOT_FOUND'
      | 'CHALLENGE_EXPIRED'
      | 'CHALLENGE_ALREADY_USED'
      | 'CHALLENGE_IN_PROGRESS'
      | 'INVALID_CHALLENGE_ANSWER'
      | 'CHALLENGE_ATTEMPTS_EXCEEDED'
      | 'CHALLENGE_RESEND_COOLDOWN'
      | 'EMAIL_DAILY_LIMIT_EXCEEDED'
      | 'GLOBAL_DAILY_LIMIT_EXCEEDED',
  ) {
    super(code);
    this.name = 'EmailChallengeError';
  }
}
