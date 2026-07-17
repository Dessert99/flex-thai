/** 관리자 민감 작업에 짧은 SMS 추가 인증과 grant를 발급한다 */
import type {
  ChallengeCryptoPort,
  SmsSender,
  StepUpRepository,
} from './challenge.repository.js';
import { AuthDomainError } from './passwordless-auth.service.js';

/** step-up 요청 전에 필요한 DB role과 Cognito 전화 정보 */
export interface StepUpUser {
  userId: string;
  role: 'LEARNER' | 'ADMIN';
  phoneNumber: string | null;
  phoneVerified: boolean;
}

/** ADMIN과 검증된 전화번호에만 action-scoped grant를 발급한다 */
export class StepUpService {
  constructor(
    private readonly repository: StepUpRepository,
    private readonly crypto: ChallengeCryptoPort,
    private readonly sms: SmsSender,
    private readonly generateOtp: () => string,
    private readonly generateGrantToken: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 5분 OTP의 HMAC만 저장하고 검증된 전화번호로 원문을 보낸다 */
  async request(
    user: StepUpUser,
    actionCategory: string,
  ): Promise<{ challengeId: string; expiresAt: Date }> {
    if (user.role !== 'ADMIN') {
      throw new AuthDomainError('ADMIN_REQUIRED');
    }

    if (!user.phoneVerified || !user.phoneNumber) {
      throw new AuthDomainError('PHONE_VERIFICATION_REQUIRED');
    }

    const otp = this.generateOtp();

    if (!/^\d{6}$/u.test(otp)) {
      throw new Error('step-up OTP 생성기는 6자리 숫자를 반환해야 합니다');
    }

    const expiresAt = new Date(this.now().getTime() + 5 * 60 * 1000);
    const challenge = await this.repository.createChallenge({
      userId: user.userId,
      actionCategory,
      otpHmac: this.crypto.hashAnswer(otp),
      expiresAt,
    });
    await this.sms.sendOtp(user.phoneNumber, otp);

    return { challengeId: challenge.id, expiresAt };
  }

  /** 성공한 OTP를 terminal로 바꾸고 10분 action grant 원문을 한 번 반환한다 */
  async verify(
    userId: string,
    challengeId: string,
    otp: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const challenge = await this.repository.findChallengeById(challengeId);

    if (
      !challenge ||
      challenge.userId !== userId ||
      challenge.status !== 'PENDING'
    ) {
      throw new AuthDomainError('STEP_UP_INVALID');
    }

    if (challenge.expiresAt.getTime() <= this.now().getTime()) {
      await this.repository.transitionChallenge(challengeId, 'EXPIRED');
      throw new AuthDomainError('STEP_UP_INVALID');
    }

    if (!this.crypto.verifyAnswer(otp, challenge.otpHmac)) {
      await this.repository.recordChallengeFailure(challengeId, 5);
      throw new AuthDomainError('STEP_UP_INVALID');
    }

    const succeeded = await this.repository.transitionChallenge(
      challengeId,
      'SUCCEEDED',
    );

    if (!succeeded) {
      throw new AuthDomainError('STEP_UP_INVALID');
    }

    const token = this.generateGrantToken();
    const expiresAt = new Date(this.now().getTime() + 10 * 60 * 1000);
    await this.repository.createGrant({
      userId,
      actionCategory: challenge.actionCategory,
      tokenHmac: this.crypto.hashAnswer(token),
      expiresAt,
    });

    return { token, expiresAt };
  }
}
