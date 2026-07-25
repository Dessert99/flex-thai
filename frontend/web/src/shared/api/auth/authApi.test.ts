/** 인증 endpoint adapter의 path·cookie·bearer·응답 계약 경계를 검증한다 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ApiError';
import type { ApiRequestOptions } from '../apiRequest';
import {
  requestLogin,
  requestLoginTotp,
  requestLogout,
  requestMe,
  requestRefresh,
  requestTotpSetup,
  requestTotpSetupVerification,
} from './authApi';

const apiRequestMock = vi.hoisted(() =>
  vi.fn<(options: ApiRequestOptions<unknown>) => Promise<unknown>>(),
);

vi.mock('../apiRequest', () => ({ apiRequest: apiRequestMock }));

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe('인증 endpoint adapter', () => {
  it('로그인·TOTP·refresh·logout에 cookie credential을 요청한다', async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        status: 'MFA_REQUIRED',
        challengeToken: 'challenge',
      })
      .mockResolvedValueOnce(createAuthenticatedResponse())
      .mockResolvedValueOnce(createAuthenticatedResponse())
      .mockResolvedValueOnce(undefined);

    await requestLogin({
      email: 'admin@example.com',
      password: 'password',
    });
    await requestLoginTotp({
      email: 'admin@example.com',
      challengeToken: 'challenge',
      code: '123456',
    });
    await requestRefresh();
    await requestLogout();

    expect(apiRequestMock.mock.calls.map(([options]) => options)).toMatchObject(
      [
        {
          includeCredentials: true,
          method: 'POST',
          path: '/auth/login',
        },
        {
          includeCredentials: true,
          method: 'POST',
          path: '/auth/mfa/totp/challenge',
        },
        {
          includeCredentials: true,
          method: 'POST',
          path: '/auth/refresh',
        },
        {
          includeCredentials: true,
          method: 'POST',
          path: '/auth/logout',
        },
      ],
    );
  });

  it('현재 사용자와 TOTP 등록 요청에만 bearer token을 전달한다', async () => {
    apiRequestMock
      .mockResolvedValueOnce(createUser())
      .mockResolvedValueOnce({ secretCode: 'ABCDEFGHIJKLMNOP' })
      .mockResolvedValueOnce({ ...createUser(), mfaEnrolled: true });

    await requestMe('access-token');
    await requestTotpSetup('access-token');
    await requestTotpSetupVerification('access-token', {
      code: '123456',
    });

    expect(apiRequestMock.mock.calls.map(([options]) => options)).toMatchObject(
      [
        { accessToken: 'access-token', path: '/me' },
        {
          accessToken: 'access-token',
          path: '/auth/mfa/totp/setup',
        },
        {
          accessToken: 'access-token',
          body: { code: '123456' },
          path: '/auth/mfa/totp/setup/verify',
        },
      ],
    );
  });

  it('refresh가 MFA_REQUIRED를 반환하면 invalid-response로 거부한다', async () => {
    apiRequestMock.mockResolvedValue({
      status: 'MFA_REQUIRED',
      challengeToken: 'unexpected',
    });

    await expect(requestRefresh()).rejects.toEqual(
      new ApiError({ kind: 'invalid-response' }),
    );
  });
});

function createUser() {
  return {
    id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
    email: 'admin@example.com',
    role: 'ADMIN' as const,
    mfaEnrolled: false,
  };
}

function createAuthenticatedResponse() {
  return {
    status: 'AUTHENTICATED' as const,
    accessToken: 'access-token',
    expiresIn: 3_600,
    user: createUser(),
  };
}
