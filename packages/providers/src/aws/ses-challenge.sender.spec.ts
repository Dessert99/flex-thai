/** 인증 이메일에 원문 6자리 코드 외 링크나 비밀번호가 없음을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { SesChallengeSender } from './ses-challenge.sender.js';

describe('SES 이메일 인증 provider', () => {
  it('학교 이메일로 6자리 인증 코드만 보낸다', async () => {
    const send = vi
      .fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValue({});
    const sender = new SesChallengeSender(
      { send } as never,
      'no-reply@example.com',
    );

    await sender.send({ email: 'student@hufs.ac.kr', code: '123456' });

    const command = send.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      input: {
        FromEmailAddress: 'no-reply@example.com',
        Destination: { ToAddresses: ['student@hufs.ac.kr'] },
      },
    });
    expect(JSON.stringify(command)).toContain('123456');
    expect(JSON.stringify(command)).not.toContain('/auth/link');
  });
});
