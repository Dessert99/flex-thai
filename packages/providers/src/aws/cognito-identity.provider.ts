/** Cognito custom auth 명령을 passwordless identity port로 변환한다 */
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  type AuthenticationResultType,
  type CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  RevokeTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { IdentityProvider, TokenSet } from '@flex-thia/domain';

const decodeIdToken = (idToken: string): { subject: string; email: string } => {
  const payloadValue = idToken.split('.')[1];

  if (!payloadValue) {
    throw new Error('Cognito ID token payload가 없습니다');
  }

  const payload = JSON.parse(
    Buffer.from(payloadValue, 'base64url').toString('utf8'),
  ) as { sub?: unknown; email?: unknown };

  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Cognito ID token에 sub와 email이 필요합니다');
  }

  return { subject: payload.sub, email: payload.email };
};

const toTokenSet = (
  result: AuthenticationResultType | undefined,
  fallbackRefreshToken?: string,
): TokenSet => {
  if (
    !result?.AccessToken ||
    !result.IdToken ||
    (!result.RefreshToken && !fallbackRefreshToken) ||
    result.ExpiresIn === undefined
  ) {
    throw new Error('Cognito token 응답이 완전하지 않습니다');
  }

  return {
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken ?? fallbackRefreshToken ?? '',
    expiresIn: result.ExpiresIn,
    ...decodeIdToken(result.IdToken),
  };
};

/** AdminCreateUser·CUSTOM_AUTH·refresh·revoke를 구현하는 Cognito adapter */
export class CognitoIdentityProvider implements IdentityProvider {
  constructor(
    private readonly client: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
    private readonly clientId: string,
  ) {}

  /** 없는 사용자는 Cognito 기본 초대 message를 억제해 조용히 준비한다 */
  async ensureUser(email: string): Promise<void> {
    try {
      await this.client.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
        }),
      );
    } catch (error) {
      if ((error as { name?: string }).name !== 'UserNotFoundException') {
        throw error;
      }

      await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          MessageAction: 'SUPPRESS',
          UserAttributes: [{ Name: 'email', Value: email }],
        }),
      );
    }
  }

  /** CUSTOM_AUTH를 시작해 public challenge id와 Cognito session을 받는다 */
  async start(
    email: string,
  ): Promise<{ challengeId: string; session: string }> {
    const result = await this.client.send(
      new InitiateAuthCommand({
        ClientId: this.clientId,
        AuthFlow: 'CUSTOM_AUTH',
        AuthParameters: { USERNAME: email },
      }),
    );
    const challengeId = result.ChallengeParameters?.challengeId;

    if (!challengeId || !result.Session) {
      throw new Error('Cognito custom challenge 응답이 완전하지 않습니다');
    }

    return { challengeId, session: result.Session };
  }

  /** code 또는 link 답을 JSON으로 전달하고 발급 token을 정규화한다 */
  async respond(input: {
    challengeId: string;
    kind: 'CODE' | 'LINK';
    answer: string;
    session: string;
    username: string;
  }): Promise<TokenSet> {
    const result = await this.client.send(
      new RespondToAuthChallengeCommand({
        ClientId: this.clientId,
        ChallengeName: 'CUSTOM_CHALLENGE',
        Session: input.session,
        ChallengeResponses: {
          USERNAME: input.username,
          ANSWER: JSON.stringify({
            kind: input.kind,
            answer: input.answer,
          }),
        },
      }),
    );
    return toTokenSet(result.AuthenticationResult);
  }

  /** refresh cookie의 token으로 새 access·ID token을 요청한다 */
  async refresh(refreshToken: string): Promise<TokenSet> {
    const result = await this.client.send(
      new InitiateAuthCommand({
        ClientId: this.clientId,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );
    return toTokenSet(result.AuthenticationResult, refreshToken);
  }

  /** logout한 refresh token을 Cognito에서 폐기한다 */
  async revoke(refreshToken: string): Promise<void> {
    await this.client.send(
      new RevokeTokenCommand({
        ClientId: this.clientId,
        Token: refreshToken,
      }),
    );
  }
}
