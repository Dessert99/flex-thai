/** passwordless 로그인과 TOTP 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  confirmEmailLinkRequestSchema,
  emailChallengeIdPathSchema,
  loginResponseSchema,
  startEmailAuthenticationRequestSchema,
  totpChallengeRequestSchema,
  verifyEmailCodeRequestSchema,
} from './auth.js';

describe('identity 인증 계약', () => {
  it('학교 이메일 challenge 시작 입력은 이메일만 받는다', () => {
    expect(
      startEmailAuthenticationRequestSchema.parse({
        email: ' USER@hufs.ac.kr ',
      }),
    ).toEqual({ email: ' USER@hufs.ac.kr ' });

    expect(() =>
      startEmailAuthenticationRequestSchema.parse({
        email: 'user@hufs.ac.kr',
        password: 'secret',
      }),
    ).toThrow();
  });

  it('코드는 6자리이고 링크 token은 43자 base64url이다', () => {
    expect(verifyEmailCodeRequestSchema.parse({ code: '123456' })).toEqual({
      code: '123456',
    });
    expect(() =>
      verifyEmailCodeRequestSchema.parse({ code: '12345' }),
    ).toThrow();
    expect(
      confirmEmailLinkRequestSchema.parse({
        token: 'A'.repeat(43),
      }),
    ).toEqual({ token: 'A'.repeat(43) });
    expect(
      emailChallengeIdPathSchema.parse({
        challengeId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      challengeId: '00000000-0000-4000-8000-000000000001',
    });
    expect(() =>
      emailChallengeIdPathSchema.parse({ challengeId: 'not-a-uuid' }),
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
        email: 'admin@hufs.ac.kr',
      }),
    ).toEqual({
      status: 'MFA_REQUIRED',
      challengeToken: 'session',
      email: 'admin@hufs.ac.kr',
    });
  });
});
