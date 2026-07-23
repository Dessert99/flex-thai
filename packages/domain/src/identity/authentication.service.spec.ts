/** 사전 준비 계정 로그인과 TOTP 상태 전이를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { AuthenticationProviderError } from './authentication.js';
import {
  IdentityAuthenticationService,
  IdentityDomainError,
} from './authentication.service.js';

const tokens = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 900,
  subject: 'cognito-sub',
  email: 'admin@example.com',
};

describe('IdentityAuthenticationService', () => {
  it('Cognito 인증 성공 뒤에만 DB identity를 연결한다', async () => {
    const provider = {
      login: vi.fn().mockResolvedValue({ kind: 'AUTHENTICATED', tokens }),
    };
    const users = {
      upsertIdentity: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        cognitoSub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        mfaEnrolledAt: new Date(),
      }),
    };
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
    );

    await expect(
      service.login(' ADMIN@EXAMPLE.COM ', 'Strong1!'),
    ).resolves.toMatchObject({
      kind: 'AUTHENTICATED',
      user: { role: 'ADMIN' },
    });
    expect(provider.login).toHaveBeenCalledWith(
      'admin@example.com',
      'Strong1!',
    );
    expect(users.upsertIdentity).toHaveBeenCalledWith({
      subject: 'cognito-sub',
      email: 'admin@example.com',
    });
  });

  it('MFA challenge에는 사용자를 upsert하지 않는다', async () => {
    const provider = {
      login: vi.fn().mockResolvedValue({
        kind: 'MFA_REQUIRED',
        challengeToken: 'session',
      }),
    };
    const users = { upsertIdentity: vi.fn() };
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
    );

    await expect(
      service.login('admin@example.com', 'Strong1!'),
    ).resolves.toEqual({
      kind: 'MFA_REQUIRED',
      challengeToken: 'session',
    });
    expect(users.upsertIdentity).not.toHaveBeenCalled();
  });

  it('TOTP 등록 성공 뒤에만 mfaEnrolledAt을 기록한다', async () => {
    const provider = { verifyTotpSetup: vi.fn().mockResolvedValue(undefined) };
    const users = { markMfaEnrolled: vi.fn().mockResolvedValue({}) };
    const now = new Date('2026-07-23T00:00:00.000Z');
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
      () => now,
    );

    await service.verifyTotpSetup({
      subject: 'cognito-sub',
      accessToken: 'access',
      code: '123456',
    });

    expect(users.markMfaEnrolled).toHaveBeenCalledWith('cognito-sub', now);
  });

  it('비활성 계정에 발급된 refresh token을 즉시 폐기한다', async () => {
    const provider = {
      login: vi.fn().mockResolvedValue({ kind: 'AUTHENTICATED', tokens }),
      revoke: vi.fn().mockResolvedValue(undefined),
    };
    const users = {
      upsertIdentity: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        cognitoSub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'DISABLED',
        mfaEnrolledAt: new Date(),
      }),
    };
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
    );

    await expect(
      service.login('admin@example.com', 'Strong1!'),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    expect(provider.revoke).toHaveBeenCalledWith('refresh');
  });

  it('TOTP 로그인 완료 입력의 이메일을 정규화한다', async () => {
    const provider = {
      completeTotpChallenge: vi.fn().mockResolvedValue(tokens),
    };
    const users = {
      upsertIdentity: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        cognitoSub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        mfaEnrolledAt: new Date(),
      }),
    };
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
    );

    await service.completeTotpChallenge({
      email: ' ADMIN@EXAMPLE.COM ',
      challengeToken: 'session',
      code: '123456',
    });

    expect(provider.completeTotpChallenge).toHaveBeenCalledWith({
      email: 'admin@example.com',
      challengeToken: 'session',
      code: '123456',
    });
  });

  it('TOTP 설정 시작을 provider에 위임한다', async () => {
    const provider = {
      startTotpSetup: vi.fn().mockResolvedValue({ secretCode: 'secret-code' }),
    };
    const service = new IdentityAuthenticationService(
      provider as never,
      {} as never,
    );

    await expect(service.startTotpSetup('access')).resolves.toEqual({
      secretCode: 'secret-code',
    });
  });

  it('refresh 성공 뒤에 최신 DB 사용자를 연결한다', async () => {
    const provider = { refresh: vi.fn().mockResolvedValue(tokens) };
    const users = {
      upsertIdentity: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        cognitoSub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        mfaEnrolledAt: new Date(),
      }),
    };
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
    );

    await expect(service.refresh('old-refresh')).resolves.toMatchObject({
      kind: 'AUTHENTICATED',
      tokens,
    });
    expect(provider.refresh).toHaveBeenCalledWith('old-refresh');
  });

  it('logout에서 refresh token을 폐기한다', async () => {
    const provider = { revoke: vi.fn().mockResolvedValue(undefined) };
    const service = new IdentityAuthenticationService(
      provider as never,
      {} as never,
    );

    await expect(service.logout('refresh')).resolves.toBeUndefined();
    expect(provider.revoke).toHaveBeenCalledWith('refresh');
  });

  it('공개 가능한 provider 오류만 Identity 오류로 변환한다', async () => {
    const provider = {
      login: vi
        .fn()
        .mockRejectedValue(
          new AuthenticationProviderError('INVALID_CREDENTIALS'),
        ),
    };
    const service = new IdentityAuthenticationService(
      provider as never,
      {} as never,
    );

    await expect(
      service.login('admin@example.com', 'wrong'),
    ).rejects.toBeInstanceOf(IdentityDomainError);
  });
});
