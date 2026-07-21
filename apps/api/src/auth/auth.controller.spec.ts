/** 가입·로그인·재설정 HTTP 계약과 token 연결을 고정한다 */
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';

describe('비밀번호 인증 controller', () => {
  it('가입 확인 endpoint는 code와 password를 인증 서비스에 전달한다', async () => {
    const verifySignup = vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      subject: 'cognito-sub',
      email: 'student@hufs.ac.kr',
    });
    const upsertIdentity = vi.fn().mockResolvedValue({});
    const controller = new AuthController(
      { verifySignup } as never,
      { upsertIdentity } as never,
    );
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };

    await controller.verifySignup(
      { challengeId: 'challenge-id', code: '123456', password: 'Strong1!' },
      response,
    );

    expect(verifySignup).toHaveBeenCalledWith(
      'challenge-id',
      '123456',
      'Strong1!',
    );
    expect(upsertIdentity).toHaveBeenCalledWith({
      subject: 'cognito-sub',
      email: 'student@hufs.ac.kr',
    });
  });

  it('비밀번호 재설정 요청은 계정 존재 여부와 무관하게 같은 응답을 준다', async () => {
    const startPasswordReset = vi
      .fn()
      .mockResolvedValue({ challengeId: 'challenge-id' });
    const controller = new AuthController(
      { startPasswordReset } as never,
      {} as never,
    );

    await expect(
      controller.forgotPassword({ email: 'student@hufs.ac.kr' }),
    ).resolves.toEqual({ accepted: true, challengeId: 'challenge-id' });
  });

  it('로그인 endpoint는 POST /auth/login으로 노출한다', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      'login',
    );
    const login: unknown = descriptor?.value;
    expect(login).toBeTypeOf('function');
    expect(Reflect.getMetadata('method', login as object)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('path', login as object)).toBe('login');
  });
});
