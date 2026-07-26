/** Cognito 사용자 준비와 CUSTOM_AUTH challenge 응답 순서를 검증한다 */
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it, vi } from 'vitest';
import { CognitoPasswordlessAuthenticationProvider } from './cognito-passwordless-authentication.provider.js';

const customAuthSecret = 'server-only-custom-auth-secret-32-bytes';
const nonce = 'N'.repeat(43);
const expectedProof = 'NZFZpahjQr6-zL8rvTIZDr90ekfluOsj0etiYk9-gms';
const idToken = `header.${Buffer.from(
  JSON.stringify({ sub: 'cognito-sub', email: 'user@hufs.ac.kr' }),
).toString('base64url')}.signature`;

describe('CognitoPasswordlessAuthenticationProvider', () => {
  it.each([false, true])(
    '신규 여부가 %s여도 사용자 준비 뒤 CUSTOM_CHALLENGE에 응답해 token을 받는다',
    async (existing) => {
      const send = makeCustomAuthSend(existing, {
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
        customAuthSecret,
      );

      await expect(provider.complete('user@hufs.ac.kr')).resolves.toMatchObject(
        {
          kind: 'AUTHENTICATED',
          tokens: { subject: 'cognito-sub', email: 'user@hufs.ac.kr' },
        },
      );

      const createCommand = send.mock.calls[0]?.[0] as
        AdminCreateUserCommand | undefined;
      const setPasswordCommand = send.mock.calls[1]?.[0] as
        AdminSetUserPasswordCommand | undefined;
      const initiateCommand = send.mock.calls[2]?.[0] as
        InitiateAuthCommand | undefined;
      const respondCommand = send.mock.calls[3]?.[0] as
        RespondToAuthChallengeCommand | undefined;
      expect(createCommand).toBeInstanceOf(AdminCreateUserCommand);
      expect(setPasswordCommand).toBeInstanceOf(AdminSetUserPasswordCommand);
      expect(initiateCommand).toBeInstanceOf(InitiateAuthCommand);
      expect(respondCommand).toBeInstanceOf(RespondToAuthChallengeCommand);
      expect(createCommand).toMatchObject({
        input: {
          UserPoolId: 'pool',
          Username: 'user@hufs.ac.kr',
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: 'user@hufs.ac.kr' },
            { Name: 'email_verified', Value: 'true' },
          ],
        },
      });
      expect(createCommand?.input.TemporaryPassword).toMatch(
        /^Aa1![A-Za-z0-9_-]{43}$/u,
      );
      expect(setPasswordCommand).toMatchObject({
        input: {
          UserPoolId: 'pool',
          Username: 'user@hufs.ac.kr',
          Permanent: true,
        },
      });
      expect(setPasswordCommand?.input.Password).toBe(
        createCommand?.input.TemporaryPassword,
      );
      expect(initiateCommand).toMatchObject({
        input: {
          AuthFlow: 'CUSTOM_AUTH',
          ClientId: 'client',
          AuthParameters: { USERNAME: 'user@hufs.ac.kr' },
        },
      });
      expect(initiateCommand?.input).not.toHaveProperty('ClientMetadata');
      expect(respondCommand).toMatchObject({
        input: {
          ChallengeName: 'CUSTOM_CHALLENGE',
          ClientId: 'client',
          Session: 'custom-session',
          ChallengeResponses: {
            USERNAME: 'user@hufs.ac.kr',
            ANSWER: expectedProof,
          },
        },
      });
    },
  );

  it('CUSTOM_CHALLENGE 성공 뒤 관리자 SOFTWARE_TOKEN_MFA를 보존한다', async () => {
    const send = makeCustomAuthSend(false, {
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: 'mfa-session',
    });
    const provider = new CognitoPasswordlessAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
      customAuthSecret,
    );

    await expect(provider.complete('admin@hufs.ac.kr')).resolves.toEqual({
      kind: 'MFA_REQUIRED',
      challengeToken: 'mfa-session',
    });
  });

  it('CUSTOM_AUTH에서 받은 SOFTWARE_TOKEN_MFA session도 public challenge로 완료한다', async () => {
    const send = makeCustomAuthSend(
      false,
      {
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        Session: 'mfa-session',
      },
      {
        AuthenticationResult: {
          AccessToken: 'access',
          IdToken: idToken,
          RefreshToken: 'refresh',
          ExpiresIn: 900,
        },
      },
    );
    const provider = new CognitoPasswordlessAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
      customAuthSecret,
    );
    await provider.complete('admin@hufs.ac.kr');

    await expect(
      provider.completeTotpChallenge({
        email: 'admin@hufs.ac.kr',
        challengeToken: 'mfa-session',
        code: '123456',
      }),
    ).resolves.toMatchObject({ accessToken: 'access' });
    expect(send.mock.calls.at(-1)?.[0]).toBeInstanceOf(
      RespondToAuthChallengeCommand,
    );
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
      input: {
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        ClientId: 'client',
        Session: 'mfa-session',
        ChallengeResponses: {
          USERNAME: 'admin@hufs.ac.kr',
          SOFTWARE_TOKEN_MFA_CODE: '123456',
        },
      },
    });
  });
});

const makeCustomAuthSend = (
  existing: boolean,
  finalResult: unknown,
  mfaResult?: unknown,
) =>
  vi.fn().mockImplementation((command: object) => {
    if (command instanceof AdminCreateUserCommand) {
      if (existing) {
        throw Object.assign(new Error('exists'), {
          name: 'UsernameExistsException',
        });
      }
      return Promise.resolve({});
    }
    if (command instanceof AdminSetUserPasswordCommand) {
      return Promise.resolve({});
    }
    if (command instanceof InitiateAuthCommand) {
      return Promise.resolve({
        ChallengeName: 'CUSTOM_CHALLENGE',
        Session: 'custom-session',
        ChallengeParameters: { nonce },
      });
    }
    if (command instanceof RespondToAuthChallengeCommand) {
      if (command.input.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
        return Promise.resolve(mfaResult);
      }
      return Promise.resolve(finalResult);
    }
    return Promise.reject(new Error('예상하지 못한 Cognito command'));
  });
