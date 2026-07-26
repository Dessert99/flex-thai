/** local에서 password 없이 learner token과 관리자 MFA를 재현한다 */
import {
  AuthenticationProviderError,
  type AuthenticationProvider,
  type IdentityTokenSet,
  type PasswordlessAuthenticationProvider,
  type ProviderLoginResult,
} from '@flex-thia/domain';

/** local fake에 고정할 이메일별 subject와 role */
export interface FakePasswordlessAccount {
  email: string;
  subject: string;
  role: 'LEARNER' | 'ADMIN';
}

/** 운영 오사용을 차단하는 local passwordless fake 설정 */
export interface FakePasswordlessAuthenticationOptions {
  mode: 'local' | 'test' | 'production';
  accounts: FakePasswordlessAccount[];
}

/** 신규 학교 이메일과 고정 계정을 같은 passwordless 결과로 처리한다 */
export class FakePasswordlessAuthenticationProvider
  implements PasswordlessAuthenticationProvider, AuthenticationProvider
{
  private readonly accounts = new Map<string, FakePasswordlessAccount>();
  private readonly challenges = new Map<string, FakePasswordlessAccount>();
  private readonly refreshTokens = new Map<string, FakePasswordlessAccount>();
  private readonly accessTokenSubjects = new Map<string, string>();
  private sequence = 0;

  constructor(options: FakePasswordlessAuthenticationOptions) {
    if (options.mode === 'production') {
      throw new Error('production에서는 passwordless fake를 사용할 수 없습니다');
    }
    for (const account of options.accounts) {
      this.accounts.set(account.email, account);
    }
  }

  /** 관리자만 MFA를 요구하고 신규 학교 이메일은 learner로 즉시 생성한다 */
  complete(email: string): Promise<ProviderLoginResult> {
    const account =
      this.accounts.get(email) ??
      ({
        email,
        subject: `local:${email}`,
        role: 'LEARNER',
      } satisfies FakePasswordlessAccount);
    this.accounts.set(email, account);

    if (account.role === 'ADMIN') {
      const challengeToken = `fake-mfa-${++this.sequence}`;
      this.challenges.set(challengeToken, account);
      return Promise.resolve({ kind: 'MFA_REQUIRED', challengeToken });
    }
    return Promise.resolve({
      kind: 'AUTHENTICATED',
      tokens: this.issueTokens(account),
    });
  }

  /** 관리자 session과 고정 local code가 모두 맞을 때 token을 발급한다 */
  completeTotpChallenge(input: {
    email: string;
    challengeToken: string;
    code: string;
  }): Promise<IdentityTokenSet> {
    const account = this.challenges.get(input.challengeToken);
    if (!account || account.email !== input.email) {
      return Promise.reject(
        new AuthenticationProviderError('INVALID_MFA_CHALLENGE'),
      );
    }
    if (input.code !== '123456') {
      return Promise.reject(new AuthenticationProviderError('INVALID_TOTP'));
    }
    this.challenges.delete(input.challengeToken);
    return Promise.resolve(this.issueTokens(account));
  }

  /** local 인증 앱 등록용 고정 secret을 반환한다 */
  startTotpSetup(accessToken: string): Promise<{ secretCode: string }> {
    void accessToken;
    return Promise.resolve({ secretCode: 'LOCALONLYTOTPSECRET' });
  }

  /** local TOTP 설정은 문서화된 고정 code만 허용한다 */
  verifyTotpSetup(accessToken: string, code: string): Promise<void> {
    void accessToken;
    return code === '123456'
      ? Promise.resolve()
      : Promise.reject(new AuthenticationProviderError('INVALID_TOTP'));
  }

  /** 활성 refresh token을 한 번 소비하고 새 token을 발급한다 */
  refresh(refreshToken: string): Promise<IdentityTokenSet> {
    const account = this.refreshTokens.get(refreshToken);
    if (!account) {
      return Promise.reject(
        new AuthenticationProviderError('INVALID_REFRESH_TOKEN'),
      );
    }
    this.refreshTokens.delete(refreshToken);
    return Promise.resolve(this.issueTokens(account));
  }

  /** local refresh token을 활성 집합에서 제거한다 */
  revoke(refreshToken: string): Promise<void> {
    this.refreshTokens.delete(refreshToken);
    return Promise.resolve();
  }

  /** local guard가 access token에서 subject를 복구한다 */
  resolveAccessTokenSubject(accessToken: string): string | undefined {
    return this.accessTokenSubjects.get(accessToken);
  }

  private issueTokens(account: FakePasswordlessAccount): IdentityTokenSet {
    const suffix = ++this.sequence;
    const accessToken = `fake-access-${suffix}`;
    const refreshToken = `fake-refresh-${suffix}`;
    this.accessTokenSubjects.set(accessToken, account.subject);
    this.refreshTokens.set(refreshToken, account);
    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      subject: account.subject,
      email: account.email,
    };
  }
}
