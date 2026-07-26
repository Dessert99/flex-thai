/** Cognito CUSTOM_AUTH 결과의 token·관리자 MFA 변환을 검증한다 */
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it, vi } from 'vitest';
import { CognitoPasswordlessAuthenticationProvider } from './cognito-passwordless-authentication.provider.js';

const idToken = `header.${Buffer.from(
  JSON.stringify({ sub: 'cognito-sub', email: 'user@hufs.ac.kr' }),
).toString('base64url')}.signature`;

describe('CognitoPasswordlessAuthenticationProvider', () => {
  it('CUSTOM_AUTH 성공을 token set으로 변환한다', async () => {
    const send = vi.fn().mockResolvedValue({
      AuthenticationResult: {
        AccessToken: 'access',
        IdToken: idToken,
        RefreshToken: 'refresh',
        ExpiresIn: 900,
      },
    });
    const provider = new CognitoPasswordlessAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await expect(provider.complete('user@hufs.ac.kr')).resolves.toMatchObject({
      kind: 'AUTHENTICATED',
      tokens: { subject: 'cognito-sub', email: 'user@hufs.ac.kr' },
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(InitiateAuthCommand);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        AuthFlow: 'CUSTOM_AUTH',
        ClientId: 'client',
        AuthParameters: { USERNAME: 'user@hufs.ac.kr' },
      },
    });
  });

  it('관리자 SOFTWARE_TOKEN_MFA challenge를 보존한다', async () => {
    const send = vi.fn().mockResolvedValue({
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: 'opaque-session',
    });
    const provider = new CognitoPasswordlessAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await expect(provider.complete('admin@hufs.ac.kr')).resolves.toEqual({
      kind: 'MFA_REQUIRED',
      challengeToken: 'opaque-session',
    });
  });
});
