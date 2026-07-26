/** Cognito TOTP·회전 refresh 명령을 Identity port로 변환한다 */
import {
  AdminRespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  type AuthenticationResultType,
  type CognitoIdentityProviderClient,
  GetTokensFromRefreshTokenCommand,
  RevokeTokenCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  AuthenticationProviderError,
  type AuthenticationProvider,
  type IdentityTokenSet,
} from '@flex-thia/domain';

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
  return {
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresIn: result.ExpiresIn,
    ...decodeIdToken(result.IdToken),
  };
};

const isAwsError = (error: unknown, names: string[]): boolean =>
  names.includes((error as { name?: string }).name ?? '');

/** passwordless 인증 뒤 Cognito TOTP·refresh 수명주기를 구현한다 */
export class CognitoAuthenticationProvider implements AuthenticationProvider {
  constructor(
    private readonly client: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
    private readonly clientId: string,
  ) {}

  /** Cognito SOFTWARE_TOKEN_MFA session과 code를 token으로 교환한다 */
  async completeTotpChallenge(input: {
    email: string;
    challengeToken: string;
    code: string;
  }): Promise<IdentityTokenSet> {
    try {
      const result = await this.client.send(
        new AdminRespondToAuthChallengeCommand({
          UserPoolId: this.userPoolId,
          ClientId: this.clientId,
          ChallengeName: 'SOFTWARE_TOKEN_MFA',
          Session: input.challengeToken,
          ChallengeResponses: {
            USERNAME: input.email,
            SOFTWARE_TOKEN_MFA_CODE: input.code,
          },
        }),
      );
      return toTokenSet(result.AuthenticationResult);
    } catch (error) {
      if (isAwsError(error, ['CodeMismatchException'])) {
        throw new AuthenticationProviderError('INVALID_TOTP');
      }
      return throwMappedError(error, 'INVALID_MFA_CHALLENGE');
    }
  }

  /** Cognito가 생성한 TOTP secret만 호출자에게 반환한다 */
  async startTotpSetup(accessToken: string): Promise<{ secretCode: string }> {
    try {
      const result = await this.client.send(
        new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
      );
      if (!result.SecretCode) {
        throw new AuthenticationProviderError('AUTH_CONFIGURATION_ERROR');
      }
      return { secretCode: result.SecretCode };
    } catch (error) {
      return throwMappedError(error, 'INVALID_TOTP');
    }
  }

  /** TOTP code 확인 뒤 SOFTWARE_TOKEN_MFA를 기본 MFA로 지정한다 */
  async verifyTotpSetup(accessToken: string, code: string): Promise<void> {
    try {
      const result = await this.client.send(
        new VerifySoftwareTokenCommand({
          AccessToken: accessToken,
          UserCode: code,
        }),
      );
      if (result.Status !== 'SUCCESS') {
        throw new AuthenticationProviderError('INVALID_TOTP');
      }
      await this.client.send(
        new SetUserMFAPreferenceCommand({
          AccessToken: accessToken,
          SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
        }),
      );
    } catch (error) {
      throwMappedError(error, 'INVALID_TOTP');
    }
  }

  /** 회전 응답의 새 refresh token까지 완전한 token set으로 요구한다 */
  async refresh(refreshToken: string): Promise<IdentityTokenSet> {
    try {
      const result = await this.client.send(
        new GetTokensFromRefreshTokenCommand({
          ClientId: this.clientId,
          RefreshToken: refreshToken,
        }),
      );
      return toTokenSet(result.AuthenticationResult);
    } catch (error) {
      return throwMappedError(error, 'INVALID_REFRESH_TOKEN');
    }
  }

  /** logout한 refresh token을 Cognito에서 폐기한다 */
  async revoke(refreshToken: string): Promise<void> {
    try {
      await this.client.send(
        new RevokeTokenCommand({
          ClientId: this.clientId,
          Token: refreshToken,
        }),
      );
    } catch (error) {
      throwMappedError(error, 'INVALID_REFRESH_TOKEN');
    }
  }
}

const throwMappedError = (
  error: unknown,
  fallback:
    | 'INVALID_CREDENTIALS'
    | 'INVALID_MFA_CHALLENGE'
    | 'INVALID_TOTP'
    | 'INVALID_REFRESH_TOKEN',
): never => {
  if (error instanceof AuthenticationProviderError) {
    throw error;
  }
  if (isAwsError(error, ['TooManyRequestsException'])) {
    throw new AuthenticationProviderError('AUTH_RATE_LIMITED');
  }
  if (
    isAwsError(error, [
      'NotAuthorizedException',
      'UserNotFoundException',
      'CodeMismatchException',
      'ExpiredCodeException',
    ])
  ) {
    throw new AuthenticationProviderError(fallback);
  }
  throw error;
};
