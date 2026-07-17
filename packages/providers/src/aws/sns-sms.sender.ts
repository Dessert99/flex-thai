/** 관리자 step-up OTP를 SNS SMS로 전송한다 */
import { PublishCommand, type SNSClient } from '@aws-sdk/client-sns';
import type { SmsSender } from '@flex-thia/domain';

/** 검증된 Cognito 전화번호에 짧은 OTP message만 보내는 adapter */
export class SnsSmsSender implements SmsSender {
  constructor(private readonly client: SNSClient) {}

  /** 민감한 작업 내용 없이 6자리 OTP만 전송한다 */
  async sendOtp(phoneNumber: string, otp: string): Promise<void> {
    await this.client.send(
      new PublishCommand({
        PhoneNumber: phoneNumber,
        Message: `[FLEX THIA] 관리자 인증번호: ${otp}`,
      }),
    );
  }
}
