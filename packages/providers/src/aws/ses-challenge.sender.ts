/** 이메일 인증용 6자리 코드를 SES v2로 전송한다 */
import { type SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { ChallengeSender } from '@flex-thia/domain';

/** SES verified identity에서 인증 코드만 보내는 adapter */
export class SesChallengeSender implements ChallengeSender {
  constructor(
    private readonly client: SESv2Client,
    private readonly fromEmail: string,
  ) {}

  /** 링크나 비밀번호 없이 일회용 코드만 대상 이메일로 보낸다 */
  async send(input: { email: string; code: string }): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.fromEmail,
        Destination: { ToAddresses: [input.email] },
        Content: {
          Simple: {
            Subject: { Data: '[FLEX THIA] 이메일 인증' },
            Body: {
              Text: { Data: `인증번호: ${input.code}` },
              Html: {
                Data: `<p>인증번호: <strong>${input.code}</strong></p>`,
              },
            },
          },
        },
      }),
    );
  }
}
