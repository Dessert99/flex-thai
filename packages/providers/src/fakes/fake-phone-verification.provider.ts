/** Cognito 없이 전화번호 등록과 검증 상태를 재현한다 */
import type { VerifiedPhoneProvider } from '@flex-thia/domain';

/** 로컬 관리자 전화번호 검증을 외부 SMS 없이 처리한다 */
export class FakePhoneVerificationProvider implements VerifiedPhoneProvider {
  private phoneNumber: string | null;
  private verified = false;

  constructor(defaultPhoneNumber: string | null = null) {
    this.phoneNumber = defaultPhoneNumber;
    this.verified = defaultPhoneNumber !== null;
  }

  /** 로컬 access token에 등록할 E.164 전화번호를 보관한다 */
  startVerification(_accessToken: string, phoneNumber: string): Promise<void> {
    this.phoneNumber = phoneNumber;
    this.verified = false;
    return Promise.resolve();
  }

  /** 로컬에서는 임의의 비어 있지 않은 code로 검증을 완료한다 */
  verify(_accessToken: string, code: string): Promise<void> {
    if (!code || !this.phoneNumber) {
      return Promise.reject(
        new Error('전화번호와 verification code가 필요합니다'),
      );
    }

    this.verified = true;
    return Promise.resolve();
  }

  /** 검증이 끝난 로컬 전화번호만 반환한다 */
  getVerifiedPhoneNumber(): Promise<string> {
    if (!this.phoneNumber || !this.verified) {
      return Promise.reject(new Error('검증된 전화번호가 없습니다'));
    }

    return Promise.resolve(this.phoneNumber);
  }
}
