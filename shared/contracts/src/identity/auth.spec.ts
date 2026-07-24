/** MVP 로그인과 TOTP 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  loginRequestSchema,
  loginResponseSchema,
  totpChallengeRequestSchema,
} from './auth.js';

describe('identity 인증 계약', () => {
  it('로그인 이메일을 정규화하고 빈 비밀번호를 거부한다', () => {
    expect(
      loginRequestSchema.parse({
        email: ' ADMIN@EXAMPLE.COM ',
        password: 'Strong1!',
      }),
    ).toEqual({ email: 'admin@example.com', password: 'Strong1!' });

    expect(() =>
      loginRequestSchema.parse({
        email: 'admin@example.com',
        password: '',
      }),
    ).toThrow();
  });

  it('TOTP 로그인 challenge는 이메일·session·6자리 code를 요구한다', () => {
    expect(() =>
      totpChallengeRequestSchema.parse({
        email: 'admin@example.com',
        challengeToken: 'session',
        code: '12345',
      }),
    ).toThrow();
  });

  it('로그인 응답은 인증 성공과 MFA 요구만 허용한다', () => {
    expect(
      loginResponseSchema.parse({
        status: 'MFA_REQUIRED',
        challengeToken: 'session',
      }),
    ).toEqual({ status: 'MFA_REQUIRED', challengeToken: 'session' });
  });
});
