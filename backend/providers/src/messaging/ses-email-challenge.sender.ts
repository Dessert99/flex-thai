/** 코드와 확인 링크를 함께 보내는 SES passwordless adapter */
import { type SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { EmailChallengeSender } from '@flex-thia/domain';

/** SES verified identity에서 10분짜리 코드와 링크를 발송한다 */
export class SesEmailChallengeSender implements EmailChallengeSender {
  constructor(
    private readonly client: SESv2Client,
    private readonly fromEmail: string,
  ) {}

  /** plain text와 HTML이 같은 인증 수단과 만료 안내를 제공한다 */
  async send(input: {
    email: string;
    code: string;
    linkUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    const text = [
      '[FLEX THIA] 로그인 인증',
      '아래 코드 또는 링크를 10분 안에 사용하세요.',
      `인증 코드: ${input.code}`,
      `로그인 확인: ${input.linkUrl}`,
    ].join('\n');
    const htmlLink = escapeHtml(input.linkUrl);

    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.fromEmail,
        Destination: { ToAddresses: [input.email] },
        Content: {
          Simple: {
            Subject: { Data: '[FLEX THIA] 로그인 인증' },
            Body: {
              Text: { Data: text },
              Html: {
                Data: `<p>아래 코드 또는 링크를 10분 안에 사용하세요.</p><p>인증 코드: <strong>${input.code}</strong></p><p><a href="${htmlLink}">로그인 확인</a></p>`,
              },
            },
          },
        },
      }),
    );
  }
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
