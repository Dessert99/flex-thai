/** SES passwordless 메일의 코드·링크 동시 발송을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { SesEmailChallengeSender } from './ses-email-challenge.sender.js';

describe('SesEmailChallengeSender', () => {
  it('plain text와 HTML에 코드와 확인 링크를 함께 넣는다', async () => {
    const send = vi
      .fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValue({});
    const sender = new SesEmailChallengeSender(
      { send } as never,
      'no-reply@example.com',
    );
    const linkUrl =
      'https://app.example/login/confirm?challengeId=id&token=A_B-c';

    await sender.send({
      email: 'user@hufs.ac.kr',
      code: '123456',
      linkUrl,
      expiresAt: new Date('2026-07-26T00:10:00.000Z'),
    });

    const command = send.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      input: {
        FromEmailAddress: 'no-reply@example.com',
        Destination: { ToAddresses: ['user@hufs.ac.kr'] },
      },
    });
    expect(JSON.stringify(command)).toContain('123456');
    expect(JSON.stringify(command)).toContain(linkUrl);
    expect(JSON.stringify(command)).toContain('10분 안에');
  });
});
