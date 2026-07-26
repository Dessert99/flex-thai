/** 사전 준비 계정의 로그인·TOTP·refresh 수명주기를 조정한다 */
import {
  AuthenticationProviderError,
  type AuthenticationProvider,
  type IdentityTokenSet,
} from './authentication.js';
import type {
  IdentityUser,
  IdentityUserRepository,
} from './user.repository.js';
import type { PasswordlessAuthenticationResult } from './passwordless-authentication.js';

/** 인증 흐름이 호출자에게 노출하는 안정적인 Identity 오류 */
export class IdentityDomainError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CREDENTIALS'
      | 'INVALID_MFA_CHALLENGE'
      | 'INVALID_TOTP'
      | 'INVALID_REFRESH_TOKEN'
      | 'AUTH_RATE_LIMITED'
      | 'ACCOUNT_DISABLED',
  ) {
    super(code);
    this.name = 'IdentityDomainError';
  }
}

/** 인증 성공 또는 TOTP challenge 대기 상태 */
export type AuthenticationResult =
  | {
      kind: 'AUTHENTICATED';
      tokens: IdentityTokenSet;
      user: IdentityUser;
    }
  | { kind: 'MFA_REQUIRED'; challengeToken: string; email: string };

/** Cognito 결과를 최신 DB 사용자 상태와 결합하는 Identity use case */
export class IdentityAuthenticationService {
  constructor(
    private readonly provider: AuthenticationProvider,
    private readonly users: IdentityUserRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** passwordless provider 결과를 최신 활성 사용자와 결합한다 */
  async completePasswordless(
    result: PasswordlessAuthenticationResult,
  ): Promise<AuthenticationResult> {
    if (result.kind === 'MFA_REQUIRED') {
      return result;
    }
    return this.completeAuthentication(result.tokens);
  }

  /** Cognito TOTP challenge를 완료한 뒤 활성 사용자와 token을 연결한다 */
  async completeTotpChallenge(input: {
    email: string;
    challengeToken: string;
    code: string;
  }): Promise<AuthenticationResult> {
    const tokens = await this.callProvider(() =>
      this.provider.completeTotpChallenge({
        ...input,
        email: normalizeEmail(input.email),
      }),
    );
    return this.completeAuthentication(tokens);
  }

  /** 현재 access token으로 TOTP secret 생성을 시작한다 */
  startTotpSetup(accessToken: string): Promise<{ secretCode: string }> {
    return this.callProvider(() => this.provider.startTotpSetup(accessToken));
  }

  /** Cognito 확인 성공 뒤에만 DB의 관리자 MFA 등록 시각을 기록한다 */
  async verifyTotpSetup(input: {
    subject: string;
    accessToken: string;
    code: string;
  }): Promise<IdentityUser> {
    await this.callProvider(() =>
      this.provider.verifyTotpSetup(input.accessToken, input.code),
    );
    return this.users.markMfaEnrolled(input.subject, this.now());
  }

  /** 회전된 refresh token을 최신 활성 사용자와 결합한다 */
  async refresh(refreshToken: string): Promise<AuthenticationResult> {
    const tokens = await this.callProvider(() =>
      this.provider.refresh(refreshToken),
    );
    return this.completeAuthentication(tokens);
  }

  /** logout 시 refresh token을 인증 공급자에서 폐기한다 */
  logout(refreshToken: string): Promise<void> {
    return this.callProvider(() => this.provider.revoke(refreshToken));
  }

  private async completeAuthentication(
    tokens: IdentityTokenSet,
  ): Promise<AuthenticationResult> {
    const user = await this.users.upsertIdentity({
      subject: tokens.subject,
      email: normalizeEmail(tokens.email),
    });

    if (user.status === 'DISABLED') {
      // 새 refresh token을 남기지 않아 비활성 계정의 재사용을 차단
      await this.provider.revoke(tokens.refreshToken);
      throw new IdentityDomainError('ACCOUNT_DISABLED');
    }

    return { kind: 'AUTHENTICATED', tokens, user };
  }

  private async callProvider<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof AuthenticationProviderError &&
        error.code !== 'AUTH_CONFIGURATION_ERROR'
      ) {
        throw new IdentityDomainError(error.code);
      }
      throw error;
    }
  }
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
