/** SNS 비용 없이 관리자 OTP 전송 내용을 기록한다 */
import type { SmsSender } from '@flex-thia/domain';

/** 성공한 OTP 전송만 in-memory 배열에 남기는 fake SMS sender */
export class FakeSmsSender implements SmsSender {
  readonly messages: Array<{ phoneNumber: string; otp: string }> = [];

  /** 테스트가 확인할 전화번호와 OTP를 외부 호출 없이 기록한다 */
  sendOtp(phoneNumber: string, otp: string): Promise<void> {
    this.messages.push({ phoneNumber, otp });
    return Promise.resolve();
  }
}
