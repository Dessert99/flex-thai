/** 이메일 검증 뒤 Cognito 비밀번호 계정을 만드는 명령 순서를 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  GetTokensFromRefreshTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityProvider } from './cognito-identity.provider.js';

const idToken = `header.${Buffer.from(
  JSON.stringify({ sub: 'subject', email: 'student@hufs.ac.kr' }),
).toString('base64url')}.signature`;

describe('Cognito 비밀번호 인증 provider', () => {
  it('초대 메일 없이 회원을 만든 뒤 비밀번호를 영구 설정하고 로그인한다', async () => {
    const send = vi
      .fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'access',
          IdToken: idToken,
          RefreshToken: 'refresh',
          ExpiresIn: 3600,
        },
      });
    const provider = new CognitoIdentityProvider(
      { send } as never,
      'user-pool-id',
      'client-id',
    );

    await provider.createVerifiedUser('student@hufs.ac.kr', 'Strong1!');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(AdminCreateUserCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(AdminSetUserPasswordCommand);
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(AdminInitiateAuthCommand);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        UserPoolId: 'user-pool-id',
        Username: 'student@hufs.ac.kr',
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: 'student@hufs.ac.kr' },
          { Name: 'email_verified', Value: 'true' },
        ],
      },
    });
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      input: {
        Username: 'student@hufs.ac.kr',
        Password: 'Strong1!',
        Permanent: true,
      },
    });
  });

  it('로그인은 서버 전용 ADMIN_USER_PASSWORD_AUTH를 사용한다', async () => {
    const send = vi
      .fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'access',
          IdToken: idToken,
          RefreshToken: 'refresh',
          ExpiresIn: 3600,
        },
      });
    const provider = new CognitoIdentityProvider(
      { send } as never,
      'user-pool-id',
      'client-id',
    );

    await provider.login('student@hufs.ac.kr', 'Strong1!');

    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: 'student@hufs.ac.kr',
          PASSWORD: 'Strong1!',
        },
      },
    });
  });

  it('토큰 갱신은 회전과 호환되는 GetTokensFromRefreshToken을 사용한다', async () => {
    const send = vi
      .fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'rotated-access',
          IdToken: idToken,
          RefreshToken: 'rotated-refresh',
          ExpiresIn: 3600,
        },
      });
    const provider = new CognitoIdentityProvider(
      { send } as never,
      'user-pool-id',
      'client-id',
    );

    await expect(provider.refresh('refresh')).resolves.toMatchObject({
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
    });

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(
      GetTokensFromRefreshTokenCommand,
    );
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: { ClientId: 'client-id', RefreshToken: 'refresh' },
    });
  });
});
