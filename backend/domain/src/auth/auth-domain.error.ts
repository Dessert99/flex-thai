/** 관리자 step-up 인증이 호출자에게 노출하는 안정적인 오류를 정의한다 */

/** 관리자 추가 인증 실패를 외부 구현과 분리한 domain 오류 */
export class AuthDomainError extends Error {
  constructor(
    readonly code:
      'ADMIN_REQUIRED' | 'PHONE_VERIFICATION_REQUIRED' | 'STEP_UP_INVALID',
  ) {
    super(code);
    this.name = 'AuthDomainError';
  }
}
