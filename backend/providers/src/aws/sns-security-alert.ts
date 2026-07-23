/** 인증 코드 전체 상한 도달을 기존 운영 SNS topic으로 알린다 */
import { PublishCommand, type SNSClient } from '@aws-sdk/client-sns';
import type { SecurityAlert } from '@flex-thia/domain';

/** 운영자가 당일 가입 중단 원인을 즉시 확인하게 하는 SNS adapter */
export class SnsSecurityAlert implements SecurityAlert {
  constructor(
    private readonly client: SNSClient,
    private readonly topicArn: string,
  ) {}

  /** 상한에 닿은 첫 요청에서 한 번만 호출되는 알림을 발행한다 */
  async globalChallengeLimitReached(limit: number): Promise<void> {
    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: '[FLEX THIA] 이메일 인증 일일 상한 도달',
        Message: `최근 24시간 이메일 인증 challenge가 전체 상한 ${limit}건에 도달했습니다.`,
      }),
    );
  }
}
