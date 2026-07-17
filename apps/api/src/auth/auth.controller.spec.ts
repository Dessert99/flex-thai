/** 이메일 링크 GET이 인증을 완료하지 않고 POST만 교환하게 고정한다 */
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
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
});
