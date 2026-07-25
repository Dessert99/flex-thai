/** 로그인 TOTP route의 메모리 challenge 접근 경계를 검증한다 */
import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { requireLoginTotpChallenge } from './login.mfa';

describe('로그인 TOTP route', () => {
  it('challenge 없는 직접 reload를 로그인으로 보낸다', () => {
    const thrown = captureThrown(() => requireLoginTotpChallenge(false));

    expect(isRedirect(thrown)).toBe(true);
    if (isRedirect(thrown)) {
      expect(thrown.options).toMatchObject({ to: '/login' });
    }
  });

  it('메모리 challenge가 있으면 접근을 허용한다', () => {
    expect(() => requireLoginTotpChallenge(true)).not.toThrow();
  });
});

function captureThrown(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error('redirect가 발생하지 않았습니다.');
}
