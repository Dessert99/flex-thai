/** local passwordless outbox가 발송 입력만 메모리에 남기는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakeEmailChallengeSender } from './fake-email-challenge.sender.js';

describe('FakeEmailChallengeSender', () => {
  it('코드와 링크를 외부 호출 없이 outbox에 기록한다', async () => {
    const sender = new FakeEmailChallengeSender();
    const message = {
      email: 'user@hufs.ac.kr',
      code: '123456',
      linkUrl: `https://app.example/login/confirm?token=${'A'.repeat(43)}`,
      expiresAt: new Date('2026-07-26T00:10:00.000Z'),
    };

    await sender.send(message);

    expect(sender.messages).toEqual([message]);
  });
});
