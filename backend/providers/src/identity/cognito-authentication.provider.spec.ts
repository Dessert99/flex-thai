/** Cognito TOTP·회전 refresh 명령을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  AdminRespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  GetTokensFromRefreshTokenCommand,
  RevokeTokenCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoAuthenticationProvider } from './cognito-authentication.provider.js';

const idToken = `header.${Buffer.from(
  JSON.stringify({ sub: 'cognito-sub', email: 'admin@example.com' }),
).toString('base64url')}.signature`;

describe('CognitoAuthenticationProvider', () => {
  it('password login 공개 메서드를 제공하지 않는다', () => {
    const provider = new CognitoAuthenticationProvider(
      { send: vi.fn() } as never,
      'pool',
      'client',
    );

    expect('login' in provider).toBe(false);
  });

  it('TOTP 로그인 challenge를 완료해 회전 가능한 token을 반환한다', async () => {
    const send = vi.fn().mockResolvedValue({
      AuthenticationResult: {
        AccessToken: 'access',
        IdToken: idToken,
        RefreshToken: 'refresh',
        ExpiresIn: 900,
      },
    });
    const provider = new CognitoAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await expect(
      provider.completeTotpChallenge({
        email: 'admin@example.com',
        challengeToken: 'cognito-session',
        code: '123456',
      }),
    ).resolves.toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      subject: 'cognito-sub',
      email: 'admin@example.com',
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(
      AdminRespondToAuthChallengeCommand,
    );
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        ChallengeResponses: {
          USERNAME: 'admin@example.com',
          SOFTWARE_TOKEN_MFA_CODE: '123456',
        },
      },
    });
  });

  it('TOTP 설정 secret을 Cognito에서 생성한다', async () => {
    const send = vi.fn().mockResolvedValue({ SecretCode: 'totp-secret-code' });
    const provider = new CognitoAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await expect(provider.startTotpSetup('access')).resolves.toEqual({
      secretCode: 'totp-secret-code',
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(
      AssociateSoftwareTokenCommand,
    );
  });

  it('TOTP 설정 확인 뒤 preference를 SOFTWARE_TOKEN_MFA로 지정한다', async () => {
    const send = vi.fn().mockResolvedValueOnce({ Status: 'SUCCESS' });
    const provider = new CognitoAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await provider.verifyTotpSetup('access', '123456');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(VerifySoftwareTokenCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(SetUserMFAPreferenceCommand);
  });

  it('회전 refresh 응답에 새 refresh token이 없으면 실패한다', async () => {
    const send = vi.fn().mockResolvedValue({
      AuthenticationResult: {
        AccessToken: 'access',
        IdToken: idToken,
        ExpiresIn: 900,
      },
    });
    const provider = new CognitoAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await expect(provider.refresh('old-refresh')).rejects.toMatchObject({
      code: 'AUTH_CONFIGURATION_ERROR',
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(
      GetTokensFromRefreshTokenCommand,
    );
  });

  it('logout에서 Cognito refresh token을 폐기한다', async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = new CognitoAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await provider.revoke('refresh');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(RevokeTokenCommand);
  });
});
