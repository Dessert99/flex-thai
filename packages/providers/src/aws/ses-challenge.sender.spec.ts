/** passwordless 이메일이 code와 POST 교환용 link token을 함께 전달하게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { SesChallengeSender } from './ses-challenge.sender.js';

describe('SesChallengeSender', () => {
  it('프론트 확인 route에 challenge id와 link token을 넣는다', async () => {
    const send = vi.fn().mockResolvedValue({});
    const sender = new SesChallengeSender(
      { send } as never,
      'no-reply@example.com',
      'https://app.example.com',
    );

    await sender.send({
      email: 'student@school.ac.kr',
      challengeId: 'challenge-id',
      code: '123456',
      linkToken: 'raw-link-token',
    });

    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        FromEmailAddress: 'no-reply@example.com',
        Destination: { ToAddresses: ['student@school.ac.kr'] },
      },
    });
    expect(JSON.stringify(send.mock.calls[0]?.[0])).toContain(
      'https://app.example.com/auth/link?challengeId=challenge-id&amp;token=raw-link-token',
    );
  });
});
