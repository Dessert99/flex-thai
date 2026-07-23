/** 이메일 소유 확인 뒤에만 Cognito 회원과 비밀번호를 설정한다 */
import { randomInt, randomUUID } from 'node:crypto';
import type { AuthChallengePurpose, TokenSet } from './challenge.js';
import { IdentityProviderError } from './challenge.repository.js';
import type {
  AuthChallengeRepository,
  ChallengeCryptoPort,
  ChallengeLimitProvider,
  ChallengeSender,
  IdentityProvider,
  SecurityAlert,
} from './challenge.repository.js';

/** 인증 domain이 호출자에게 노출하는 안정적인 오류 code */
export class AuthDomainError extends Error {
  constructor(
    readonly code:
      | 'SCHOOL_EMAIL_REQUIRED'
      | 'CHALLENGE_INVALID'
      | 'CHALLENGE_RATE_LIMITED'
      | 'PASSWORD_POLICY_VIOLATION'
      | 'ACCOUNT_ALREADY_EXISTS'
      | 'INVALID_CREDENTIALS'
      | 'ADMIN_REQUIRED'
      | 'PHONE_VERIFICATION_REQUIRED'
      | 'STEP_UP_INVALID',
  ) {
    super(code);
    this.name = 'AuthDomainError';
  }
}

/** 이메일 challenge와 Cognito 비밀번호 인증 수명주기를 관리한다 */
export class PasswordAuthService {
  private readonly allowedDomains: Set<string>;

  constructor(
    private readonly challenges: AuthChallengeRepository,
    private readonly identity: IdentityProvider,
    private readonly crypto: ChallengeCryptoPort,
    private readonly sender: ChallengeSender,
    private readonly limitProvider: ChallengeLimitProvider,
    private readonly securityAlert: SecurityAlert,
    allowedDomains: string[],
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
    private readonly createCode: () => string = () =>
      randomInt(100_000, 1_000_000).toString(),
  ) {
    this.allowedDomains = new Set(
      allowedDomains.map((domain) => domain.toLowerCase()),
    );
  }

  /** Cognito를 호출하지 않고 학교 이메일 인증 코드만 발송한다 */
  async startSignup(emailInput: string): Promise<{ challengeId: string }> {
    const email = this.normalizeSchoolEmail(emailInput);
    const { challenge, code } = await this.createChallenge(email, 'SIGNUP');
    await this.sender.send({ email, code });
    return { challengeId: challenge.id };
  }

  /** 코드 성공 뒤에만 비밀번호를 Cognito에 영구 설정하고 token을 발급한다 */
  async verifySignup(
    challengeId: string,
    code: string,
    password: string,
  ): Promise<TokenSet> {
    this.assertPassword(password);
    const email = await this.consumeChallenge(challengeId, code, 'SIGNUP');
    try {
      return await this.identity.createVerifiedUser(email, password);
    } catch (error) {
      if (
        error instanceof IdentityProviderError &&
        error.code === 'ACCOUNT_EXISTS'
      ) {
        throw new AuthDomainError('ACCOUNT_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  /** 학교 이메일과 비밀번호를 Cognito 서버 전용 흐름으로 검증한다 */
  async login(emailInput: string, password: string): Promise<TokenSet> {
    const email = this.normalizeSchoolEmail(emailInput);
    try {
      return await this.identity.login(email, password);
    } catch (error) {
      if (
        error instanceof IdentityProviderError &&
        error.code === 'INVALID_CREDENTIALS'
      ) {
        throw new AuthDomainError('INVALID_CREDENTIALS');
      }
      throw error;
    }
  }

  /** 계정 존재 여부를 응답에 드러내지 않고 기존 회원에게만 재설정 코드를 보낸다 */
  async startPasswordReset(
    emailInput: string,
  ): Promise<{ challengeId: string }> {
    const email = this.normalizeSchoolEmail(emailInput);
    const { challenge, code } = await this.createChallenge(
      email,
      'PASSWORD_RESET',
    );

    if (!(await this.identity.userExists(email))) {
      return { challengeId: challenge.id };
    }

    await this.sender.send({ email, code });
    return { challengeId: challenge.id };
  }

  /** 이메일 코드 성공 뒤 Cognito 비밀번호만 교체한다 */
  async resetPassword(
    challengeId: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    this.assertPassword(newPassword);
    const email = await this.consumeChallenge(
      challengeId,
      code,
      'PASSWORD_RESET',
    );
    await this.identity.setPassword(email, newPassword);
  }

  /** HttpOnly cookie의 refresh token을 새 access token으로 교환한다 */
  refresh(refreshToken: string): Promise<TokenSet> {
    return this.identity.refresh(refreshToken);
  }

  /** logout 시 refresh token을 identity provider에서 폐기한다 */
  revoke(refreshToken: string): Promise<void> {
    return this.identity.revoke(refreshToken);
  }

  private async createChallenge(email: string, purpose: AuthChallengePurpose) {
    const createdAt = this.now();
    const code = this.createCode();
    const limits = await this.limitProvider.getLimits();
    const result = await this.challenges.createWithinLimits({
      id: this.createId(),
      email,
      purpose,
      codeHmac: this.crypto.hashAnswer(code),
      expiresAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
      createdAt,
      limits,
    });

    if (result.kind !== 'CREATED') {
      throw new AuthDomainError('CHALLENGE_RATE_LIMITED');
    }

    if (result.globalLimitReached) {
      await this.securityAlert.globalChallengeLimitReached(limits.globalPerDay);
    }
    return { challenge: result.challenge, code };
  }

  private async consumeChallenge(
    challengeId: string,
    code: string,
    purpose: AuthChallengePurpose,
  ): Promise<string> {
    if (
      typeof challengeId !== 'string' ||
      !challengeId ||
      typeof code !== 'string' ||
      !/^\d{6}$/u.test(code)
    ) {
      throw new AuthDomainError('CHALLENGE_INVALID');
    }
    const challenge = await this.challenges.findById(challengeId);

    if (
      !challenge ||
      challenge.purpose !== purpose ||
      challenge.status !== 'PENDING'
    ) {
      throw new AuthDomainError('CHALLENGE_INVALID');
    }

    if (challenge.expiresAt.getTime() <= this.now().getTime()) {
      await this.challenges.transition(challengeId, 'EXPIRED');
      throw new AuthDomainError('CHALLENGE_INVALID');
    }

    if (!this.crypto.verifyAnswer(code, challenge.codeHmac)) {
      await this.challenges.recordFailure(challengeId, 5);
      throw new AuthDomainError('CHALLENGE_INVALID');
    }

    if (!(await this.challenges.transition(challengeId, 'SUCCEEDED'))) {
      throw new AuthDomainError('CHALLENGE_INVALID');
    }

    return challenge.email;
  }

  private normalizeSchoolEmail(emailInput: string): string {
    if (typeof emailInput !== 'string') {
      throw new AuthDomainError('SCHOOL_EMAIL_REQUIRED');
    }
    const email = emailInput.trim().toLowerCase();
    const [localPart, domain, extra] = email.split('@');

    if (
      !localPart ||
      !domain ||
      extra !== undefined ||
      /\s/u.test(localPart) ||
      !this.allowedDomains.has(domain)
    ) {
      throw new AuthDomainError('SCHOOL_EMAIL_REQUIRED');
    }
    return email;
  }

  private assertPassword(password: string): void {
    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      !/[A-Z]/u.test(password) ||
      !/[a-z]/u.test(password) ||
      !/\d/u.test(password) ||
      !/[^A-Za-z0-9]/u.test(password)
    ) {
      throw new AuthDomainError('PASSWORD_POLICY_VIOLATION');
    }
  }
}
