/** passwordless code와 확인 link를 SES v2 이메일로 전송한다 */
import { type SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { ChallengeSender } from '@flex-thia/domain';

/** SES verified identity에서 passwordless 이메일을 보내는 adapter */
export class SesChallengeSender implements ChallengeSender {
  constructor(
    private readonly client: SESv2Client,
    private readonly fromEmail: string,
    private readonly appUrl: string,
  ) {}

  /** link GET은 프론트 확인 화면만 열고 token 교환은 POST가 담당하게 한다 */
  async send(input: {
    email: string;
    challengeId: string;
    code: string;
    linkToken: string;
  }): Promise<void> {
    const link =
      `${this.appUrl}/auth/link?challengeId=` +
      `${encodeURIComponent(input.challengeId)}&token=` +
      encodeURIComponent(input.linkToken);
    const htmlLink = link.replaceAll('&', '&amp;');
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.fromEmail,
        Destination: { ToAddresses: [input.email] },
        Content: {
          Simple: {
            Subject: { Data: '[FLEX THIA] 로그인 인증' },
            Body: {
              Text: {
                Data: `인증번호: ${input.code}\n로그인 링크: ${link}`,
              },
              Html: {
                Data:
                  `<p>인증번호: <strong>${input.code}</strong></p>` +
                  `<p><a href="${htmlLink}">로그인 계속하기</a></p>`,
              },
            },
          },
        },
      }),
    );
  }
}
