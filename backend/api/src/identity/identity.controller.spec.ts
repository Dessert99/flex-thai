/** Identity Controller가 token을 body와 cookie 경계에 맞게 전달하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { IdentityController } from './identity.controller.js';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  cognitoSub: 'cognito-sub',
  email: 'admin@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  mfaEnrolledAt: new Date('2026-07-23T00:00:00.000Z'),
} as const;

const tokens = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 900,
  subject: 'cognito-sub',
  email: 'admin@example.com',
};

const response = () => ({ cookie: vi.fn(), clearCookie: vi.fn() });

describe('IdentityController 인증 흐름', () => {
  it('공개 signup·password reset·phone·SMS method를 제공하지 않는다', () => {
    [
      'signup',
      'verifySignup',
      'forgotPassword',
      'resetPassword',
      'start',
      'verify',
      'request',
      'login',
    ].forEach((method) => {
      expect(IdentityController.prototype).not.toHaveProperty(method);
    });
  });

  it('링크 확인 POST에서만 refresh cookie를 쓰고 body에서는 제외한다', async () => {
    const completeLink = vi.fn().mockResolvedValue({
      kind: 'AUTHENTICATED',
      tokens,
    });
    const completePasswordless = vi
      .fn()
      .mockResolvedValue({ kind: 'AUTHENTICATED', tokens, user });
    const controller = new IdentityController(
      { completePasswordless } as never,
      { completeLink } as never,
    );
    const cookieResponse = response();

    const result = await controller.confirmLink(
      { challengeId: '00000000-0000-4000-8000-000000000001' },
      { token: 'A'.repeat(43) },
      cookieResponse,
    );
    const serialized = JSON.stringify(result);

    expect(cookieResponse.cookie).toHaveBeenCalledTimes(1);
    expect(cookieResponse.cookie).toHaveBeenCalledWith(
      '__Host-flex-thia-refresh',
      'refresh',
      {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    );
    expect(result).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'access',
    });
    expect(serialized).not.toContain('refreshToken');
    expect(serialized).not.toContain(tokens.refreshToken);
  });

  it('코드 확인의 MFA_REQUIRED 응답은 refresh cookie를 쓰지 않는다', async () => {
    const completeCode = vi.fn().mockResolvedValue({
      kind: 'MFA_REQUIRED',
      challengeToken: 'session',
    });
    const completePasswordless = vi.fn().mockResolvedValue({
      kind: 'MFA_REQUIRED',
      challengeToken: 'session',
      email: 'admin@hufs.ac.kr',
    });
    const controller = new IdentityController(
      { completePasswordless } as never,
      { completeCode } as never,
    );
    const cookieResponse = response();

    await expect(
      controller.verifyCode(
        { challengeId: '00000000-0000-4000-8000-000000000001' },
        { code: '123456' },
        cookieResponse,
      ),
    ).resolves.toEqual({
      status: 'MFA_REQUIRED',
      challengeToken: 'session',
      email: 'admin@hufs.ac.kr',
    });
    expect(cookieResponse.cookie).not.toHaveBeenCalled();
  });

  it('challenge 시작은 신규·기존 계정 여부 없이 같은 응답 형태를 반환한다', async () => {
    const genericChallengeResponse = {
      challengeId: '00000000-0000-4000-8000-000000000001',
      expiresAt: new Date('2026-07-26T00:10:00.000Z'),
      resendAt: new Date('2026-07-26T00:01:00.000Z'),
    };
    const start = vi.fn().mockResolvedValue(genericChallengeResponse);
    const controller = new IdentityController({} as never, { start } as never);

    await expect(
      controller.startChallenge({ email: 'existing@hufs.ac.kr' }),
    ).resolves.toEqual({
      challengeId: genericChallengeResponse.challengeId,
      expiresAt: genericChallengeResponse.expiresAt.toISOString(),
      resendAt: genericChallengeResponse.resendAt.toISOString(),
    });
    await expect(
      controller.startChallenge({ email: 'new@hufs.ac.kr' }),
    ).resolves.toEqual({
      challengeId: genericChallengeResponse.challengeId,
      expiresAt: genericChallengeResponse.expiresAt.toISOString(),
      resendAt: genericChallengeResponse.resendAt.toISOString(),
    });
  });

  it('refresh 성공은 회전된 token을 같은 cookie 속성으로 쓰고 body에서 제외한다', async () => {
    const refresh = vi
      .fn()
      .mockResolvedValue({ kind: 'AUTHENTICATED', tokens, user });
    const controller = new IdentityController(
      { refresh } as never,
      {} as never,
    );
    const cookieResponse = response();

    const result = await controller.refresh(
      {
        headers: {
          cookie: '__Host-flex-thia-refresh=old-refresh',
        },
      },
      cookieResponse,
    );
    const serialized = JSON.stringify(result);

    expect(refresh).toHaveBeenCalledWith('old-refresh');
    expect(cookieResponse.cookie).toHaveBeenCalledTimes(1);
    expect(cookieResponse.cookie).toHaveBeenCalledWith(
      '__Host-flex-thia-refresh',
      'refresh',
      {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    );
    expect(serialized).not.toContain('refreshToken');
    expect(serialized).not.toContain(tokens.refreshToken);
  });

  it('refresh cookie가 없으면 안정적인 401 오류를 반환한다', async () => {
    const controller = new IdentityController({} as never, {} as never);

    await expect(
      controller.refresh({ headers: {} }, response()),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('logout은 token 폐기 뒤 같은 보안 속성으로 cookie를 지운다', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const controller = new IdentityController({ logout } as never, {} as never);
    const cookieResponse = response();

    const result = await controller.logout(
      {
        headers: {
          cookie: '__Host-flex-thia-refresh=refresh',
        },
      },
      cookieResponse,
    );

    expect(logout).toHaveBeenCalledWith('refresh');
    expect(cookieResponse.clearCookie).toHaveBeenCalledWith(
      '__Host-flex-thia-refresh',
      {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      },
    );
    expect(result).toBeUndefined();
  });

  it('setup verify는 현재 sub와 bearer access token을 use case에 전달한다', async () => {
    const verifyTotpSetup = vi.fn().mockResolvedValue(user);
    const controller = new IdentityController(
      { verifyTotpSetup } as never,
      {} as never,
    );

    await controller.verifyTotpSetup(
      { headers: { authorization: 'Bearer access' } },
      {
        userId: user.id,
        sub: user.cognitoSub,
        email: user.email,
        role: user.role,
        mfaEnrolledAt: null,
      },
      { code: '123456' },
    );

    expect(verifyTotpSetup).toHaveBeenCalledWith({
      subject: 'cognito-sub',
      accessToken: 'access',
      code: '123456',
    });
  });
});
