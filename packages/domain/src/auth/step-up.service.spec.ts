/** 관리자 권한·전화 검증과 grant 원문 비저장을 고정하는 테스트 */
import { describe, expect, it, vi } from 'vitest';
import { StepUpService } from './step-up.service.js';

describe('StepUpService', () => {
  it('ADMIN이 아니면 SMS를 보내기 전에 거부한다', async () => {
    const sms = { sendOtp: vi.fn() };
    const service = new StepUpService(
      {} as never,
      {} as never,
      sms,
      () => '123456',
      () => 'raw-grant-token',
    );

    await expect(
      service.request(
        {
          userId: 'user-id',
          role: 'LEARNER',
          phoneNumber: '+821012345678',
          phoneVerified: true,
        },
        'ADMIN_COMMAND',
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
    expect(sms.sendOtp).not.toHaveBeenCalled();
  });

  it('성공한 추가 인증은 raw token을 한 번 반환하고 HMAC만 저장한다', async () => {
    const challenge = {
      id: 'step-up-id',
      userId: 'user-id',
      actionCategory: 'ADMIN_COMMAND',
      otpHmac: 'hashed-123456',
      attempts: 0,
      status: 'PENDING' as const,
      expiresAt: new Date('2026-07-17T00:05:00.000Z'),
    };
    const repository = {
      createChallenge: vi.fn(),
      findChallengeById: vi.fn().mockResolvedValue(challenge),
      recordChallengeFailure: vi.fn(),
      transitionChallenge: vi.fn().mockResolvedValue(true),
      createGrant: vi.fn().mockResolvedValue(undefined),
      findActiveGrants: vi.fn(),
    };
    const crypto = {
      hashAnswer: vi.fn((value: string) => `hashed-${value}`),
      verifyAnswer: vi.fn().mockReturnValue(true),
      encryptSession: vi.fn(),
      decryptSession: vi.fn(),
    };
    const service = new StepUpService(
      repository,
      crypto,
      { sendOtp: vi.fn() },
      () => '123456',
      () => 'raw-grant-token',
      () => new Date('2026-07-17T00:00:00.000Z'),
    );

    await expect(
      service.verify('user-id', 'step-up-id', '123456'),
    ).resolves.toMatchObject({ token: 'raw-grant-token' });
    expect(repository.createGrant).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHmac: 'hashed-raw-grant-token' }),
    );
    expect(repository.createGrant).not.toHaveBeenCalledWith(
      expect.objectContaining({ tokenHmac: 'raw-grant-token' }),
    );
  });
});
