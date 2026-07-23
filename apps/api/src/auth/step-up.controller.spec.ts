/** step-up SMS 번호를 API body가 아니라 verified phone provider에서 읽게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { StepUpController } from './step-up.controller.js';

describe('StepUpController', () => {
  it('Cognito에서 읽은 verified phone만 service에 전달한다', async () => {
    const request = vi.fn().mockResolvedValue({ challengeId: 'id' });
    const phone = {
      getVerifiedPhoneNumber: vi.fn().mockResolvedValue('+821012345678'),
    };
    const controller = new StepUpController(
      { request, verify: vi.fn() } as never,
      phone as never,
    );

    await controller.request(
      {
        userId: 'user-id',
        sub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        mfaEnrolledAt: new Date('2026-07-23T00:00:00.000Z'),
      },
      'Bearer access-token',
      { actionCategory: 'AI_BULK_CREATE' },
    );

    expect(request).toHaveBeenCalledWith(
      {
        userId: 'user-id',
        role: 'ADMIN',
        phoneNumber: '+821012345678',
        phoneVerified: true,
      },
      'AI_BULK_CREATE',
    );
  });
});
