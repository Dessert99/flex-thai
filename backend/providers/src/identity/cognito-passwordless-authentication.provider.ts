/** Cognito CUSTOM_AUTH를 기존 TOTP·refresh 수명주기와 결합한다 */
import { createHmac, randomBytes } from 'node:crypto';
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  type AuthenticationResultType,
  type CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  AuthenticationProviderError,
  buildCustomAuthProofMessage,
  type IdentityTokenSet,
  type PasswordlessAuthenticationProvider,
  type ProviderLoginResult,
} from '@flex-thia/domain';
import { CognitoAuthenticationProvider } from './cognito-authentication.provider.js';

/** CUSTOM_AUTH 완료와 기존 Cognito token 관리를 함께 제공한다 */
export class CognitoPasswordlessAuthenticationProvider
  extends CognitoAuthenticationProvider
  implements PasswordlessAuthenticationProvider
{
  constructor(
    private readonly passwordlessClient: CognitoIdentityProviderClient,
    private readonly passwordlessUserPoolId: string,
    private readonly passwordlessClientId: string,
    private readonly customAuthSecret: string,
  ) {
    super(passwordlessClient, passwordlessUserPoolId, passwordlessClientId);
    if (Buffer.byteLength(customAuthSecret, 'utf8') < 32) {
      throw new AuthenticationProviderError('AUTH_CONFIGURATION_ERROR');
    }
  }

  /** 학교 이메일 CUSTOM_AUTH 결과를 token 또는 관리자 MFA로 제한한다 */
  async complete(email: string): Promise<ProviderLoginResult> {
    try {
      await this.ensureConfirmedUser(email);
      const initiated = await this.passwordlessClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'CUSTOM_AUTH',
          ClientId: this.passwordlessClientId,
          AuthParameters: { USERNAME: email },
        }),
      );
      const nonce = initiated.ChallengeParameters?.nonce;
      if (
        initiated.ChallengeName !== 'CUSTOM_CHALLENGE' ||
        !initiated.Session ||
        !nonce
      ) {
        throw new AuthenticationProviderError('AUTH_CONFIGURATION_ERROR');
      }
      const result = await this.passwordlessClient.send(
        new RespondToAuthChallengeCommand({
          ChallengeName: 'CUSTOM_CHALLENGE',
          ClientId: this.passwordlessClientId,
          Session: initiated.Session,
          ChallengeResponses: {
            USERNAME: email,
            ANSWER: createCustomAuthProof(this.customAuthSecret, email, nonce),
          },
        }),
      );
      if (result.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
        if (!result.Session) {
          throw new AuthenticationProviderError('AUTH_CONFIGURATION_ERROR');
        }
        return { kind: 'MFA_REQUIRED', challengeToken: result.Session };
      }
      return {
        kind: 'AUTHENTICATED',
        tokens: toTokenSet(result.AuthenticationResult),
      };
    } catch (error) {
      if (error instanceof AuthenticationProviderError) throw error;
      if ((error as { name?: string }).name === 'TooManyRequestsException') {
        throw new AuthenticationProviderError('AUTH_RATE_LIMITED');
      }
      throw error;
    }
  }

  /** CUSTOM_AUTH에서 이어진 TOTP session을 같은 public auth 흐름으로 완료한다 */
  override async completeTotpChallenge(input: {
    email: string;
    challengeToken: string;
    code: string;
  }): Promise<IdentityTokenSet> {
    try {
      const result = await this.passwordlessClient.send(
        new RespondToAuthChallengeCommand({
          ChallengeName: 'SOFTWARE_TOKEN_MFA',
          ClientId: this.passwordlessClientId,
          Session: input.challengeToken,
          ChallengeResponses: {
            USERNAME: input.email,
            SOFTWARE_TOKEN_MFA_CODE: input.code,
          },
        }),
      );
      return toTokenSet(result.AuthenticationResult);
    } catch (error) {
      if (error instanceof AuthenticationProviderError) throw error;
      const name = (error as { name?: string }).name;
      if (name === 'TooManyRequestsException') {
        throw new AuthenticationProviderError('AUTH_RATE_LIMITED');
      }
      if (name === 'CodeMismatchException') {
        throw new AuthenticationProviderError('INVALID_TOTP');
      }
      if (
        [
          'NotAuthorizedException',
          'UserNotFoundException',
          'ExpiredCodeException',
        ].includes(name ?? '')
      ) {
        throw new AuthenticationProviderError('INVALID_MFA_CHALLENGE');
      }
      throw error;
    }
  }

  private async ensureConfirmedUser(email: string): Promise<void> {
    const internalPassword = `Aa1!${randomBytes(32).toString('base64url')}`;
    try {
      await this.passwordlessClient.send(
        new AdminCreateUserCommand({
          UserPoolId: this.passwordlessUserPoolId,
          Username: email,
          MessageAction: 'SUPPRESS',
          TemporaryPassword: internalPassword,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
        }),
      );
    } catch (error) {
      if ((error as { name?: string }).name !== 'UsernameExistsException') {
        throw error;
      }
    }
    // 신규·기존 모두 외부에 알려지지 않는 영구 password로 CONFIRMED 상태를 보장한다.
    await this.passwordlessClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.passwordlessUserPoolId,
        Username: email,
        Password: internalPassword,
        Permanent: true,
      }),
    );
  }
}

const createCustomAuthProof = (
  secret: string,
  username: string,
  nonce: string,
): string =>
  createHmac('sha256', secret)
    .update(buildCustomAuthProofMessage(username, nonce))
    .digest('base64url');

const toTokenSet = (
  result: AuthenticationResultType | undefined,
): IdentityTokenSet => {
  if (
    !result?.AccessToken ||
    !result.IdToken ||
    !result.RefreshToken ||
    result.ExpiresIn === undefined
  ) {
    throw new AuthenticationProviderError('AUTH_CONFIGURATION_ERROR');
  }
  const claims = decodeIdToken(result.IdToken);
  return {
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresIn: result.ExpiresIn,
    ...claims,
  };
};

const decodeIdToken = (idToken: string): { subject: string; email: string } => {
  try {
    const payloadValue = idToken.split('.')[1];
    if (!payloadValue) throw new Error();
    const payload = JSON.parse(
      Buffer.from(payloadValue, 'base64url').toString('utf8'),
    ) as { sub?: unknown; email?: unknown };
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new Error();
    }
    return { subject: payload.sub, email: payload.email };
  } catch {
    throw new AuthenticationProviderError('AUTH_CONFIGURATION_ERROR');
  }
};
