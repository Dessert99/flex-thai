/** Cognito와 local fake가 구현할 Identity 인증 port를 정의한다 */

/** 인증 성공 뒤 애플리케이션에 전달할 token과 사용자 claim */
export interface IdentityTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  subject: string;
  email: string;
}

/** 비밀번호 인증이 완료되거나 TOTP 입력을 기다리는 provider 결과 */
export type ProviderLoginResult =
  | { kind: 'AUTHENTICATED'; tokens: IdentityTokenSet }
  | { kind: 'MFA_REQUIRED'; challengeToken: string };

/** 외부 인증 공급자가 구현해야 하는 Identity 동작 */
export interface AuthenticationProvider {
  completeTotpChallenge(input: {
    email: string;
    challengeToken: string;
    code: string;
  }): Promise<IdentityTokenSet>;
  startTotpSetup(accessToken: string): Promise<{ secretCode: string }>;
  verifyTotpSetup(accessToken: string, code: string): Promise<void>;
  refresh(refreshToken: string): Promise<IdentityTokenSet>;
  revoke(refreshToken: string): Promise<void>;
}

/** 외부 인증 상세를 domain 경계 안의 안정적인 code로 제한한다 */
export class AuthenticationProviderError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CREDENTIALS'
      | 'INVALID_MFA_CHALLENGE'
      | 'INVALID_TOTP'
      | 'INVALID_REFRESH_TOKEN'
      | 'AUTH_RATE_LIMITED'
      | 'AUTH_CONFIGURATION_ERROR',
  ) {
    super(code);
    this.name = 'AuthenticationProviderError';
  }
}
