/** 이메일 링크 GET이 인증을 완료하지 않고 POST만 교환하게 고정한다 */
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';

describe('AuthController', () => {
  it('link token 교환 endpoint는 POST method만 노출한다', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      'verifyLink',
    );
    const verifyLink: unknown = descriptor?.value;

    expect(verifyLink).toBeTypeOf('function');

    if (typeof verifyLink !== 'function') {
      throw new Error('verifyLink method를 찾을 수 없습니다');
    }

    expect(Reflect.getMetadata('method', verifyLink) as unknown).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('path', verifyLink) as unknown).toBe(
      'challenges/:challengeId/link',
    );
  });

  it('인증 성공 token의 sub와 email을 애플리케이션 사용자로 연결한다', async () => {
    const upsertIdentity = vi.fn().mockResolvedValue({});
    const controller = new AuthController(
      {
        verifyCode: vi.fn().mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
          subject: 'cognito-sub',
          email: 'admin@school.ac.kr',
        }),
      } as never,
      { upsertIdentity } as never,
    );
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };

    await controller.verifyCode('challenge-id', { code: '123456' }, response);

    expect(upsertIdentity).toHaveBeenCalledWith({
      subject: 'cognito-sub',
      email: 'admin@school.ac.kr',
    });
  });
});
