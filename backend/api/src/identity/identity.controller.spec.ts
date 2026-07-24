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

describe('IdentityController', () => {
  it('공개 signup·password reset·phone·SMS method를 제공하지 않는다', () => {
    [
      'signup',
      'verifySignup',
      'forgotPassword',
      'resetPassword',
      'start',
      'verify',
      'request',
    ].forEach((method) => {
      expect(IdentityController.prototype).not.toHaveProperty(method);
    });
  });

  it('로그인 성공은 refresh cookie를 쓰고 body에서 refresh token을 제외한다', async () => {
    const login = vi
      .fn()
      .mockResolvedValue({ kind: 'AUTHENTICATED', tokens, user });
    const controller = new IdentityController({ login } as never);
    const cookieResponse = response();

    const result = await controller.login(
      { email: 'admin@example.com', password: 'Strong1!' },
      cookieResponse,
    );

    expect(cookieResponse.cookie).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'access',
    });
    expect(result).not.toHaveProperty('refreshToken');
  });

  it('MFA_REQUIRED 응답은 refresh cookie를 쓰지 않는다', async () => {
    const login = vi.fn().mockResolvedValue({
      kind: 'MFA_REQUIRED',
      challengeToken: 'session',
    });
    const controller = new IdentityController({ login } as never);
    const cookieResponse = response();

    await expect(
      controller.login(
        { email: 'admin@example.com', password: 'Strong1!' },
        cookieResponse,
      ),
    ).resolves.toEqual({
      status: 'MFA_REQUIRED',
      challengeToken: 'session',
    });
    expect(cookieResponse.cookie).not.toHaveBeenCalled();
  });

  it('refresh cookie가 없으면 안정적인 401 오류를 반환한다', async () => {
    const controller = new IdentityController({} as never);

    await expect(
      controller.refresh({ headers: {} }, response()),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('logout은 token 폐기 뒤 같은 보안 속성으로 cookie를 지운다', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const controller = new IdentityController({ logout } as never);
    const cookieResponse = response();

    await controller.logout(
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
  });

  it('setup verify는 현재 sub와 bearer access token을 use case에 전달한다', async () => {
    const verifyTotpSetup = vi.fn().mockResolvedValue(user);
    const controller = new IdentityController({ verifyTotpSetup } as never);

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
