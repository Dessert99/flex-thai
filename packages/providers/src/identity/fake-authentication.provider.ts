/** Cognito 없이 사전 준비 계정의 비밀번호·TOTP·refresh를 재현한다 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  AuthenticationProviderError,
  type AuthenticationProvider,
  type IdentityTokenSet,
  type ProviderLoginResult,
} from '@flex-thia/domain';

/** local fake에 사전 준비할 한 계정의 인증 설정 */
export interface FakeAuthenticationOptions {
  email: string;
  password: string;
  subject: string;
  requireTotp: boolean;
}

/** 비밀번호 원문을 저장하지 않고 회전 token 수명주기를 재현한다 */
export class FakeAuthenticationProvider implements AuthenticationProvider {
  private readonly salt = randomBytes(16);
  private readonly passwordDigest: Buffer;
  private readonly challenges = new Map<string, string>();
  private readonly refreshTokens = new Set<string>();
  private readonly revokedTokens = new Set<string>();
  private sequence = 0;

  constructor(private readonly options: FakeAuthenticationOptions) {
    this.passwordDigest = scryptSync(options.password, this.salt, 32);
  }

  /** 사전 준비 계정의 scrypt digest가 일치할 때만 인증을 계속한다 */
  login(email: string, password: string): Promise<ProviderLoginResult> {
    const actual = scryptSync(password, this.salt, 32);
    if (
      email !== this.options.email ||
      !timingSafeEqual(this.passwordDigest, actual)
    ) {
      return Promise.reject(
        new AuthenticationProviderError('INVALID_CREDENTIALS'),
      );
    }

    if (this.options.requireTotp) {
      const challengeToken = `fake-mfa-${++this.sequence}`;
      this.challenges.set(challengeToken, email);
      return Promise.resolve({ kind: 'MFA_REQUIRED', challengeToken });
    }

    return Promise.resolve({
      kind: 'AUTHENTICATED',
      tokens: this.issueTokens(),
    });
  }

  /** 발급한 session과 고정 local code가 모두 맞을 때만 token을 발급한다 */
  completeTotpChallenge(input: {
    email: string;
    challengeToken: string;
    code: string;
  }): Promise<IdentityTokenSet> {
    const challengeEmail = this.challenges.get(input.challengeToken);
    if (!challengeEmail || challengeEmail !== input.email) {
      return Promise.reject(
        new AuthenticationProviderError('INVALID_MFA_CHALLENGE'),
      );
    }
    if (input.code !== '123456') {
      return Promise.reject(new AuthenticationProviderError('INVALID_TOTP'));
    }

    this.challenges.delete(input.challengeToken);
    return Promise.resolve(this.issueTokens());
  }

  /** local 인증 앱 등록에 사용할 비밀값을 고정해 테스트를 재현한다 */
  startTotpSetup(_accessToken: string): Promise<{ secretCode: string }> {
    return Promise.resolve({ secretCode: 'LOCALONLYTOTPSECRET' });
  }

  /** local TOTP 확인은 문서화한 고정 code만 허용한다 */
  verifyTotpSetup(_accessToken: string, code: string): Promise<void> {
    if (code !== '123456') {
      return Promise.reject(new AuthenticationProviderError('INVALID_TOTP'));
    }
    return Promise.resolve();
  }

  /** 활성 refresh token을 소비하고 suffix가 증가한 새 token을 발급한다 */
  refresh(refreshToken: string): Promise<IdentityTokenSet> {
    if (!this.refreshTokens.delete(refreshToken)) {
      return Promise.reject(
        new AuthenticationProviderError('INVALID_REFRESH_TOKEN'),
      );
    }
    return Promise.resolve(this.issueTokens());
  }

  /** 폐기한 refresh token을 활성 집합에서 제거한다 */
  revoke(refreshToken: string): Promise<void> {
    this.refreshTokens.delete(refreshToken);
    this.revokedTokens.add(refreshToken);
    return Promise.resolve();
  }

  private issueTokens(): IdentityTokenSet {
    const suffix = ++this.sequence;
    const refreshToken = `fake-refresh-${suffix}`;
    this.refreshTokens.add(refreshToken);
    return {
      accessToken: `fake-access-${suffix}`,
      refreshToken,
      expiresIn: 900,
      subject: this.options.subject,
      email: this.options.email,
    };
  }
}
