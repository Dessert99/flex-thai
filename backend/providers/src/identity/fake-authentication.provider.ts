/** Cognito 없이 사전 준비 계정의 비밀번호·TOTP·refresh를 재현한다 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  AuthenticationProviderError,
  type AuthenticationProvider,
  type IdentityTokenSet,
  type ProviderLoginResult,
} from '@flex-thia/domain';

/** local fake에 사전 준비할 계정별 인증 설정 */
export interface FakeAuthenticationAccountOptions {
  email: string;
  password: string;
  subject: string;
  requireTotp: boolean;
}

/** local fake가 함께 제공할 사전 준비 계정 목록 */
export interface FakeAuthenticationOptions {
  accounts: FakeAuthenticationAccountOptions[];
}

type PreparedAccount = FakeAuthenticationAccountOptions & {
  passwordDigest: Buffer;
  salt: Buffer;
};

/** 비밀번호 원문을 저장하지 않고 회전 token 수명주기를 재현한다 */
export class FakeAuthenticationProvider implements AuthenticationProvider {
  private readonly accessTokenSubjects = new Map<string, string>();
  private readonly accounts = new Map<string, PreparedAccount>();
  private readonly challenges = new Map<string, PreparedAccount>();
  private readonly refreshTokenAccounts = new Map<string, PreparedAccount>();
  private readonly revokedTokens = new Set<string>();
  private sequence = 0;

  constructor(options: FakeAuthenticationOptions) {
    for (const account of options.accounts) {
      const salt = randomBytes(16);
      this.accounts.set(account.email, {
        ...account,
        salt,
        passwordDigest: scryptSync(account.password, salt, 32),
      });
    }
  }

  /** 사전 준비 계정의 scrypt digest가 일치할 때만 인증을 계속한다 */
  login(email: string, password: string): Promise<ProviderLoginResult> {
    const account = this.accounts.get(email);
    if (!account) {
      return Promise.reject(
        new AuthenticationProviderError('INVALID_CREDENTIALS'),
      );
    }

    const actual = scryptSync(password, account.salt, 32);
    if (!timingSafeEqual(account.passwordDigest, actual)) {
      return Promise.reject(
        new AuthenticationProviderError('INVALID_CREDENTIALS'),
      );
    }

    if (account.requireTotp) {
      const challengeToken = `fake-mfa-${++this.sequence}`;
      this.challenges.set(challengeToken, account);
      return Promise.resolve({ kind: 'MFA_REQUIRED', challengeToken });
    }

    return Promise.resolve({
      kind: 'AUTHENTICATED',
      tokens: this.issueTokens(account),
    });
  }

  /** 발급한 session과 고정 local code가 모두 맞을 때만 token을 발급한다 */
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

  /** local 인증 앱 등록에 사용할 비밀값을 고정해 테스트를 재현한다 */
  startTotpSetup(accessToken: string): Promise<{ secretCode: string }> {
    void accessToken;
    return Promise.resolve({ secretCode: 'LOCALONLYTOTPSECRET' });
  }

  /** local TOTP 확인은 문서화한 고정 code만 허용한다 */
  verifyTotpSetup(accessToken: string, code: string): Promise<void> {
    void accessToken;
    if (code !== '123456') {
      return Promise.reject(new AuthenticationProviderError('INVALID_TOTP'));
    }
    return Promise.resolve();
  }

  /** 활성 refresh token을 소비하고 suffix가 증가한 새 token을 발급한다 */
  refresh(refreshToken: string): Promise<IdentityTokenSet> {
    const account = this.refreshTokenAccounts.get(refreshToken);
    if (!account) {
      return Promise.reject(
        new AuthenticationProviderError('INVALID_REFRESH_TOKEN'),
      );
    }
    this.refreshTokenAccounts.delete(refreshToken);
    return Promise.resolve(this.issueTokens(account));
  }

  /** 폐기한 refresh token을 활성 집합에서 제거한다 */
  revoke(refreshToken: string): Promise<void> {
    this.refreshTokenAccounts.delete(refreshToken);
    this.revokedTokens.add(refreshToken);
    return Promise.resolve();
  }

  /** 발급한 local access token에 연결된 subject만 반환한다 */
  resolveAccessTokenSubject(accessToken: string): string | undefined {
    return this.accessTokenSubjects.get(accessToken);
  }

  private issueTokens(account: PreparedAccount): IdentityTokenSet {
    const suffix = ++this.sequence;
    const accessToken = `fake-access-${suffix}`;
    const refreshToken = `fake-refresh-${suffix}`;
    this.accessTokenSubjects.set(accessToken, account.subject);
    this.refreshTokenAccounts.set(refreshToken, account);
    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      subject: account.subject,
      email: account.email,
    };
  }
}
