/** Cognito CUSTOM_AUTH를 기존 TOTP·refresh 수명주기와 결합한다 */
import {
  type AuthenticationResultType,
  type CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  AuthenticationProviderError,
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
    userPoolId: string,
    private readonly passwordlessClientId: string,
  ) {
    super(passwordlessClient, userPoolId, passwordlessClientId);
  }

  /** 학교 이메일 CUSTOM_AUTH 결과를 token 또는 관리자 MFA로 제한한다 */
  async complete(email: string): Promise<ProviderLoginResult> {
    try {
      const result = await this.passwordlessClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'CUSTOM_AUTH',
          ClientId: this.passwordlessClientId,
          AuthParameters: { USERNAME: email },
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
      if (
        (error as { name?: string }).name === 'TooManyRequestsException'
      ) {
        throw new AuthenticationProviderError('AUTH_RATE_LIMITED');
      }
      throw error;
    }
  }
}

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
