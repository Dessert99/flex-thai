/** 학교 이메일 passwordless 시작과 Cognito 응답을 조율한다 */
import type { ChallengeAnswerKind, TokenSet } from './challenge.js';
import type {
  AuthChallengeRepository,
  ChallengeCryptoPort,
  IdentityProvider,
} from './challenge.repository.js';

/** 인증 domain이 호출자에게 노출하는 안정적인 오류 code */
export class AuthDomainError extends Error {
  constructor(
    readonly code:
      | 'SCHOOL_EMAIL_REQUIRED'
      | 'CHALLENGE_INVALID'
      | 'ADMIN_REQUIRED'
      | 'PHONE_VERIFICATION_REQUIRED'
      | 'STEP_UP_INVALID',
  ) {
    super(code);
    this.name = 'AuthDomainError';
  }
}

/** Cognito trigger가 HMAC·만료·최대 시도를 판정하는 use case */
export class VerifyChallengeAnswerService {
  constructor(
    private readonly repository: AuthChallengeRepository,
    private readonly crypto: ChallengeCryptoPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** terminal 상태를 되돌리지 않고 일회용 답 하나만 성공시킨다 */
  async execute(input: {
    challengeId: string;
    kind: ChallengeAnswerKind;
    answer: string;
  }): Promise<boolean> {
    const challenge = await this.repository.findById(input.challengeId);

    if (!challenge || challenge.status !== 'PENDING') {
      return false;
    }

    if (challenge.expiresAt.getTime() <= this.now().getTime()) {
      await this.repository.transition(input.challengeId, 'EXPIRED');
      return false;
    }

    const stored =
      input.kind === 'CODE' ? challenge.codeHmac : challenge.linkHmac;

    if (!this.crypto.verifyAnswer(input.answer, stored)) {
      await this.repository.recordFailure(input.challengeId, 5);
      return false;
    }

    return this.repository.transition(input.challengeId, 'SUCCEEDED');
  }
}

/** 학교 이메일 allowlist와 암호화된 Cognito session 수명주기를 관리한다 */
export class PasswordlessAuthService {
  private readonly allowedDomains: Set<string>;

  constructor(
    private readonly challenges: AuthChallengeRepository,
    private readonly identity: IdentityProvider,
    private readonly crypto: ChallengeCryptoPort,
    allowedDomains: string[],
    private readonly now: () => Date = () => new Date(),
  ) {
    this.allowedDomains = new Set(
      allowedDomains.map((domain) => domain.toLowerCase()),
    );
  }

  /** 계정 존재 여부와 무관한 공개 응답으로 학교 이메일 challenge를 시작한다 */
  async start(emailInput: string): Promise<{ challengeId: string }> {
    const email = emailInput.trim().toLowerCase();
    const separatorIndex = email.lastIndexOf('@');
    const domain = email.slice(separatorIndex + 1);

    if (separatorIndex <= 0 || !domain || !this.allowedDomains.has(domain)) {
      throw new AuthDomainError('SCHOOL_EMAIL_REQUIRED');
    }

    await this.identity.ensureUser(email);
    const started = await this.identity.start(email);
    await this.challenges.attachSession(
      started.challengeId,
      this.crypto.encryptSession(
        JSON.stringify({ session: started.session, username: email }),
      ),
    );

    return { challengeId: started.challengeId };
  }

  /** 숫자 code를 암호화된 Cognito session과 함께 교환한다 */
  verifyCode(challengeId: string, code: string): Promise<TokenSet> {
    return this.respond(challengeId, 'CODE', code);
  }

  /** POST로 받은 link token을 암호화된 Cognito session과 함께 교환한다 */
  verifyLink(challengeId: string, token: string): Promise<TokenSet> {
    return this.respond(challengeId, 'LINK', token);
  }

  /** HttpOnly cookie의 refresh token을 새 access token으로 교환한다 */
  refresh(refreshToken: string): Promise<TokenSet> {
    return this.identity.refresh(refreshToken);
  }

  /** logout 시 refresh token을 identity provider에서 폐기한다 */
  revoke(refreshToken: string): Promise<void> {
    return this.identity.revoke(refreshToken);
  }

  private async respond(
    challengeId: string,
    kind: ChallengeAnswerKind,
    answer: string,
  ): Promise<TokenSet> {
    const challenge = await this.challenges.findById(challengeId);

    if (
      !challenge ||
      challenge.status !== 'PENDING' ||
      !challenge.sessionCiphertext ||
      challenge.expiresAt.getTime() <= this.now().getTime()
    ) {
      throw new AuthDomainError('CHALLENGE_INVALID');
    }

    const sessionValue = this.crypto.decryptSession(
      challenge.sessionCiphertext,
    );
    const sessionRecord = JSON.parse(sessionValue) as {
      session?: unknown;
      username?: unknown;
    };

    if (
      typeof sessionRecord.session !== 'string' ||
      typeof sessionRecord.username !== 'string'
    ) {
      throw new AuthDomainError('CHALLENGE_INVALID');
    }

    return this.identity.respond({
      challengeId,
      kind,
      answer,
      session: sessionRecord.session,
      username: sessionRecord.username,
    });
  }
}
