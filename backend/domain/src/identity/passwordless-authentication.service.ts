/** 학교 이메일 challenge의 생성·발송·원자 소비를 조정한다 */
import { EmailChallengeError } from './email-challenge.js';
import type {
  EmailChallengeAnswer,
  EmailChallengeRepository,
} from './email-challenge.repository.js';
import type {
  ChallengeSecretsFactory,
  EmailChallengeSender,
  PasswordlessAuthenticationResult,
  PasswordlessAuthenticationProvider,
} from './passwordless-authentication.js';

const CHALLENGE_LIFETIME_MS = 600_000;
const RESEND_COOLDOWN_MS = 60_000;

/** 계정 존재 여부를 포함하지 않는 challenge 시작 결과 */
export interface EmailChallengeStartResult {
  challengeId: string;
  expiresAt: Date;
  resendAt: Date;
}

/** 이메일 challenge를 발급하고 먼저 성공한 답만 인증하는 use case */
export class PasswordlessAuthenticationService {
  constructor(
    private readonly repository: EmailChallengeRepository,
    private readonly provider: PasswordlessAuthenticationProvider,
    private readonly sender: EmailChallengeSender,
    private readonly secrets: ChallengeSecretsFactory,
    private readonly linkConfirmationUrl: string,
  ) {}

  /** 학교 이메일을 정규화해 동일한 제한 아래 challenge를 시작한다 */
  async start(
    emailInput: string,
    now: Date,
  ): Promise<EmailChallengeStartResult> {
    const email = normalizeSchoolEmail(emailInput);
    const secrets = this.secrets.createChallengeSecrets();
    const expiresAt = new Date(now.getTime() + CHALLENGE_LIFETIME_MS);
    const resendAt = new Date(now.getTime() + RESEND_COOLDOWN_MS);
    const challenge = await this.repository.createWithinLimits({
      email,
      codeHmac: secrets.codeHmac,
      linkHmac: secrets.linkHmac,
      expiresAt,
      resendAt,
      now,
      limits: {
        emailDaily: 5,
        globalDaily: 500,
        maxAttempts: 5,
      },
    });
    await this.deliver(challenge, secrets);

    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      resendAt: challenge.resendAt,
    };
  }

  /** 기존 PENDING을 원자 교체한 뒤 새 코드와 링크를 발송한다 */
  async resend(
    challengeId: string,
    now: Date,
  ): Promise<EmailChallengeStartResult> {
    const secrets = this.secrets.createChallengeSecrets();
    const challenge = await this.repository.replaceForResend({
      challengeId,
      codeHmac: secrets.codeHmac,
      linkHmac: secrets.linkHmac,
      expiresAt: new Date(now.getTime() + CHALLENGE_LIFETIME_MS),
      resendAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      now,
      limits: {
        emailDaily: 5,
        globalDaily: 500,
        maxAttempts: 5,
      },
    });
    await this.deliver(challenge, secrets, {
      previousChallengeId: challengeId,
      replacementChallengeId: challenge.id,
    });
    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      resendAt: challenge.resendAt,
    };
  }

  /** 6자리 코드로 challenge 소비를 예약하고 인증을 완료한다 */
  completeCode(
    challengeId: string,
    code: string,
    now: Date,
  ): Promise<PasswordlessAuthenticationResult> {
    return this.complete(challengeId, { kind: 'CODE', answer: code }, now);
  }

  /** 링크 token으로 같은 challenge 소비 경로를 사용한다 */
  completeLink(
    challengeId: string,
    linkToken: string,
    now: Date,
  ): Promise<PasswordlessAuthenticationResult> {
    return this.complete(
      challengeId,
      { kind: 'LINK', answer: linkToken },
      now,
    );
  }

  private async complete(
    challengeId: string,
    answer: EmailChallengeAnswer,
    now: Date,
  ): Promise<PasswordlessAuthenticationResult> {
    const challenge = await this.repository.reserveConsumption({
      challengeId,
      answer,
      now,
    });

    let result: Awaited<
      ReturnType<PasswordlessAuthenticationProvider['complete']>
    >;
    try {
      result = await this.provider.complete(challenge.email);
    } catch (error) {
      // 외부 provider 실패는 같은 challenge를 안전하게 재시도할 수 있게 예약만 해제
      await this.repository.releaseConsumption(challengeId);
      throw error;
    }

    await this.repository.finalizeConsumption(challengeId, now);
    return result.kind === 'MFA_REQUIRED'
      ? { ...result, email: challenge.email }
      : result;
  }

  private async deliver(
    challenge: {
      id: string;
      email: string;
      expiresAt: Date;
    },
    secrets: {
      code: string;
      linkToken: string;
    },
    replacement?: {
      previousChallengeId: string;
      replacementChallengeId: string;
    },
  ): Promise<void> {
    const linkUrl = new URL(this.linkConfirmationUrl);
    linkUrl.searchParams.set('challengeId', challenge.id);
    linkUrl.searchParams.set('token', secrets.linkToken);
    try {
      await this.sender.send({
        email: challenge.email,
        code: secrets.code,
        linkUrl: linkUrl.toString(),
        expiresAt: challenge.expiresAt,
      });
    } catch (error) {
      await this.repository.markDelivery(challenge.id, 'FAILED');
      if (replacement) {
        await this.repository.restoreReplacedChallenge({
          previousChallengeId: replacement.previousChallengeId,
          replacementChallengeId: replacement.replacementChallengeId,
        });
      }
      throw error;
    }
    await this.repository.markDelivery(challenge.id, 'SENT');
  }
}

const normalizeSchoolEmail = (emailInput: string): string => {
  const email = emailInput.trim().toLowerCase();
  if (!email.endsWith('@hufs.ac.kr') || email.slice(0, -11).length === 0) {
    throw new EmailChallengeError('INVALID_SCHOOL_EMAIL');
  }
  return email;
};
