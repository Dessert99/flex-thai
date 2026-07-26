/** 학교 이메일 challenge의 생성과 원자적 완료 흐름을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { EmailChallengeError } from './email-challenge.js';
import { PasswordlessAuthenticationService } from './passwordless-authentication.service.js';

const now = new Date('2026-07-26T00:00:00.000Z');
const challengeId = '00000000-0000-4000-8000-000000000001';
const linkToken = 'A'.repeat(43);
const challenge = {
  id: challengeId,
  email: 'user@hufs.ac.kr',
  expiresAt: new Date('2026-07-26T00:10:00.000Z'),
  resendAt: new Date('2026-07-26T00:01:00.000Z'),
  attempts: 0,
  status: 'PENDING' as const,
  reservedAt: now,
};
const replacementChallenge = {
  ...challenge,
  id: '00000000-0000-4000-8000-000000000002',
};
const providerResult = {
  kind: 'AUTHENTICATED' as const,
  tokens: {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresIn: 900,
    subject: 'subject',
    email: 'user@hufs.ac.kr',
  },
};

const makeService = () => {
  const repository = {
    createWithinLimits: vi.fn().mockResolvedValue(challenge),
    reserveConsumption: vi.fn().mockResolvedValue(challenge),
    finalizeConsumption: vi.fn().mockResolvedValue(undefined),
    releaseConsumption: vi.fn().mockResolvedValue(undefined),
    markDelivery: vi.fn().mockResolvedValue(undefined),
    replaceForResend: vi.fn().mockResolvedValue(replacementChallenge),
    restoreReplacedChallenge: vi.fn().mockResolvedValue(undefined),
  };
  const provider = {
    complete: vi.fn().mockResolvedValue(providerResult),
  };
  const sender = { send: vi.fn().mockResolvedValue(undefined) };
  const secrets = {
    createChallengeSecrets: vi.fn().mockReturnValue({
      code: '123456',
      linkToken,
      codeHmac: 'code-hmac',
      linkHmac: 'link-hmac',
    }),
  };
  const service = new PasswordlessAuthenticationService(
    repository,
    provider,
    sender,
    secrets,
    'https://app.example/login/confirm',
  );
  return { provider, repository, sender, service };
};

describe('PasswordlessAuthenticationService', () => {
  it('hufs.ac.kr 이메일을 정규화하고 challenge를 시작한다', async () => {
    const { repository, sender, service } = makeService();

    const result = await service.start(' USER@hufs.ac.kr ', now);

    expect(repository.createWithinLimits).toHaveBeenCalledWith({
      email: 'user@hufs.ac.kr',
      codeHmac: 'code-hmac',
      linkHmac: 'link-hmac',
      expiresAt: new Date('2026-07-26T00:10:00.000Z'),
      resendAt: new Date('2026-07-26T00:01:00.000Z'),
      now,
      limits: {
        emailDaily: 5,
        globalDaily: 500,
        maxAttempts: 5,
      },
    });
    expect(sender.send).toHaveBeenCalledWith({
      email: 'user@hufs.ac.kr',
      code: '123456',
      linkUrl: `https://app.example/login/confirm?challengeId=${challengeId}&token=${linkToken}`,
      expiresAt: challenge.expiresAt,
    });
    expect(result).toEqual({
      challengeId,
      expiresAt: challenge.expiresAt,
      resendAt: challenge.resendAt,
    });
    expect(result).not.toHaveProperty('existingUser');
  });

  it('beta 안내 발송 기록이 없어도 새 학교 이메일 challenge를 시작한다', async () => {
    const { repository, service } = makeService();

    await expect(service.start('new@hufs.ac.kr', now)).resolves.toBeDefined();

    expect(repository.createWithinLimits).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@hufs.ac.kr' }),
    );
  });

  it.each([
    'user@not-hufs.ac.kr',
    'a@b@hufs.ac.kr',
    'user @hufs.ac.kr',
    'user@mail.hufs.ac.kr',
    '.user@hufs.ac.kr',
  ])(
    '문법 또는 domain이 잘못된 이메일 %s는 challenge를 만들지 않는다',
    async (email) => {
      const { repository, service } = makeService();

      await expect(service.start(email, now)).rejects.toMatchObject({
        code: 'INVALID_SCHOOL_EMAIL',
      });
      expect(repository.createWithinLimits).not.toHaveBeenCalled();
    },
  );

  it('코드와 링크 중 먼저 성공한 수단만 인증한다', async () => {
    const { repository, service } = makeService();
    repository.reserveConsumption
      .mockResolvedValueOnce(challenge)
      .mockRejectedValueOnce(new EmailChallengeError('CHALLENGE_ALREADY_USED'));

    await expect(
      service.completeCode(challengeId, '123456', now),
    ).resolves.toEqual(providerResult);
    await expect(
      service.completeLink(challengeId, linkToken, now),
    ).rejects.toMatchObject({ code: 'CHALLENGE_ALREADY_USED' });
    expect(repository.finalizeConsumption).toHaveBeenCalledWith(
      challengeId,
      now,
      now,
    );
  });

  it('provider 실패 시 challenge 소비 예약을 해제한다', async () => {
    const { provider, repository, service } = makeService();
    provider.complete.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.completeCode(challengeId, '123456', now),
    ).rejects.toThrow('provider unavailable');
    expect(repository.finalizeConsumption).not.toHaveBeenCalled();
    expect(repository.releaseConsumption).toHaveBeenCalledWith(
      challengeId,
      now,
    );
  });

  it('유효한 challenge의 MFA 응답에 정규화 email을 붙인다', async () => {
    const { provider, service } = makeService();
    provider.complete.mockResolvedValue({
      kind: 'MFA_REQUIRED',
      challengeToken: 'opaque-session',
    });

    await expect(
      service.completeLink(challengeId, linkToken, now),
    ).resolves.toEqual({
      kind: 'MFA_REQUIRED',
      challengeToken: 'opaque-session',
      email: 'user@hufs.ac.kr',
    });
  });

  it('최초 메일 발송 실패를 terminal delivery 상태로 기록한다', async () => {
    const { repository, sender, service } = makeService();
    sender.send.mockRejectedValue(new Error('SES unavailable'));

    await expect(service.start('user@hufs.ac.kr', now)).rejects.toThrow(
      'SES unavailable',
    );
    expect(repository.markDelivery).toHaveBeenCalledWith(challengeId, 'FAILED');
  });

  it('재전송은 기존 challenge를 교체하고 발송 실패 시 이전 상태를 복구한다', async () => {
    const { repository, sender, service } = makeService();
    sender.send.mockRejectedValue(new Error('SES unavailable'));

    await expect(service.resend(challengeId, now)).rejects.toThrow(
      'SES unavailable',
    );
    expect(repository.replaceForResend).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId,
        codeHmac: 'code-hmac',
        linkHmac: 'link-hmac',
      }),
    );
    expect(repository.restoreReplacedChallenge).toHaveBeenCalledWith({
      previousChallengeId: challengeId,
      replacementChallengeId: replacementChallenge.id,
    });
    expect(repository.markDelivery).not.toHaveBeenCalledWith(
      replacementChallenge.id,
      'FAILED',
    );
  });

  it('메일 발송 성공 뒤 상태 저장 실패를 발송 실패로 오분류하지 않는다', async () => {
    const { repository, service } = makeService();
    repository.markDelivery.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(service.start('user@hufs.ac.kr', now)).rejects.toThrow(
      'database unavailable',
    );
    expect(repository.markDelivery).toHaveBeenCalledTimes(1);
    expect(repository.markDelivery).toHaveBeenCalledWith(challengeId, 'SENT');
  });

  it('재전송 메일 성공 뒤 상태 저장 실패에는 이전 challenge를 복구하지 않는다', async () => {
    const { repository, service } = makeService();
    repository.markDelivery.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(service.resend(challengeId, now)).rejects.toThrow(
      'database unavailable',
    );
    expect(repository.restoreReplacedChallenge).not.toHaveBeenCalled();
  });
});
