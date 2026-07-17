/** 관리자 OTP만 짧은 SNS message로 전송하게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { SnsSmsSender } from './sns-sms.sender.js';

describe('SnsSmsSender', () => {
  it('검증된 전화번호에 6자리 OTP를 보낸다', async () => {
    const send = vi.fn().mockResolvedValue({});
    const sender = new SnsSmsSender({ send } as never);

    await sender.sendOtp('+821012345678', '123456');

    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        PhoneNumber: '+821012345678',
        Message: '[FLEX THIA] 관리자 인증번호: 123456',
      },
    });
  });
});
