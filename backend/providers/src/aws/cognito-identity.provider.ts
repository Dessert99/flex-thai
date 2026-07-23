/** Cognito 관리자 비밀번호 명령을 identity port로 변환한다 */
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  type AdminInitiateAuthCommandOutput,
  AdminSetUserPasswordCommand,
  type AuthenticationResultType,
  type CognitoIdentityProviderClient,
  GetTokensFromRefreshTokenCommand,
  RevokeTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  IdentityProviderError,
  type IdentityProvider,
  type TokenSet,
} from '@flex-thia/domain';

const decodeIdToken = (idToken: string): { subject: string; email: string } => {
  const payloadValue = idToken.split('.')[1];
  if (!payloadValue) throw new Error('Cognito ID token payload가 없습니다');
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

/** 회원 생성·비밀번호 설정·서버 전용 로그인을 구현하는 Cognito adapter */
export class CognitoIdentityProvider implements IdentityProvider {
  constructor(
    private readonly client: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
    private readonly clientId: string,
  ) {}

  /** 재설정 응답으로 계정 존재 여부가 새지 않게 boolean만 반환한다 */
  async userExists(email: string): Promise<boolean> {
    try {
      await this.client.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'UserNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  /** 검증된 이메일만 초대 message 없이 만들고 영구 비밀번호를 설정한다 */
  async createVerifiedUser(email: string, password: string): Promise<TokenSet> {
    try {
      await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
        }),
      );
    } catch (error) {
      if ((error as { name?: string }).name === 'UsernameExistsException') {
        throw new IdentityProviderError('ACCOUNT_EXISTS');
      }
      throw error;
    }
    await this.setPassword(email, password);
    return this.login(email, password);
  }

  /** 비밀번호 원문을 저장하지 않고 Cognito 서버 전용 auth에 전달한다 */
  async login(email: string, password: string): Promise<TokenSet> {
    let result: AdminInitiateAuthCommandOutput;
    try {
      result = await this.client.send(
        new AdminInitiateAuthCommand({
          UserPoolId: this.userPoolId,
          ClientId: this.clientId,
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          AuthParameters: { USERNAME: email, PASSWORD: password },
        }),
      );
    } catch (error) {
      if (
        ['NotAuthorizedException', 'UserNotFoundException'].includes(
          (error as { name?: string }).name ?? '',
        )
      ) {
        throw new IdentityProviderError('INVALID_CREDENTIALS');
      }
      throw error;
    }
    return toTokenSet(result.AuthenticationResult);
  }

  /** 이메일 인증을 끝낸 계정의 비밀번호만 영구 값으로 교체한다 */
  async setPassword(email: string, newPassword: string): Promise<void> {
    await this.client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        Password: newPassword,
        Permanent: true,
      }),
    );
  }

  /** refresh cookie의 token으로 새 access·ID token을 요청한다 */
  async refresh(refreshToken: string): Promise<TokenSet> {
    const result = await this.client.send(
      new GetTokensFromRefreshTokenCommand({
        ClientId: this.clientId,
        RefreshToken: refreshToken,
      }),
    );
    return toTokenSet(result.AuthenticationResult);
  }

  /** logout한 refresh token을 Cognito에서 폐기한다 */
  async revoke(refreshToken: string): Promise<void> {
    await this.client.send(
      new RevokeTokenCommand({ ClientId: this.clientId, Token: refreshToken }),
    );
  }
}
