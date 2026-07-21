/** 이메일 검증 전 회원 생성 차단과 비밀번호 비저장을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import type { AuthChallenge } from './challenge.js';
import type {
  AuthChallengeRepository,
  ChallengeCryptoPort,
  ChallengeLimitProvider,
  ChallengeSender,
  IdentityProvider,
  SecurityAlert,
} from './challenge.repository.js';
import { PasswordAuthService } from './passwordless-auth.service.js';

const now = new Date('2026-07-21T00:00:00.000Z');

const createFixture = () => {
  const challenge: AuthChallenge = {
    id: 'challenge-id',
    email: 'student@hufs.ac.kr',
    purpose: 'SIGNUP',
    codeHmac: 'stored-code',
    attempts: 0,
    status: 'PENDING',
    expiresAt: new Date('2026-07-21T00:10:00.000Z'),
    createdAt: now,
  };
  const createWithinLimits = vi
    .fn<AuthChallengeRepository['createWithinLimits']>()
    .mockResolvedValue({
      kind: 'CREATED',
      challenge,
      globalLimitReached: false,
    });
  const findById = vi
    .fn<AuthChallengeRepository['findById']>()
    .mockResolvedValue(challenge);
  const recordFailure = vi
    .fn<AuthChallengeRepository['recordFailure']>()
    .mockResolvedValue(challenge);
  const transition = vi
    .fn<AuthChallengeRepository['transition']>()
    .mockResolvedValue(true);
  const challenges: AuthChallengeRepository = {
    createWithinLimits,
    findById,
    recordFailure,
    transition,
  };
  const userExists = vi
    .fn<IdentityProvider['userExists']>()
    .mockResolvedValue(true);
  const createVerifiedUser = vi
    .fn<IdentityProvider['createVerifiedUser']>()
    .mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 3600,
      subject: 'subject',
      email: 'student@hufs.ac.kr',
    });
  const identity: IdentityProvider = {
    userExists,
    createVerifiedUser,
    login: vi.fn(),
    setPassword: vi.fn(),
    refresh: vi.fn(),
    revoke: vi.fn(),
  };
  const send = vi.fn<ChallengeSender['send']>().mockResolvedValue(undefined);
  const crypto: ChallengeCryptoPort = {
    hashAnswer: vi.fn(() => 'stored-code'),
    verifyAnswer: vi.fn((answer) => answer === '123456'),
  };
  const sender: ChallengeSender = { send };
  const getLimits = vi
    .fn<ChallengeLimitProvider['getLimits']>()
    .mockResolvedValue({
      cooldownSeconds: 60,
      perEmailPerDay: 5,
      globalPerDay: 500,
    });
  const limits: ChallengeLimitProvider = {
    getLimits,
  };
  const globalChallengeLimitReached = vi
    .fn<SecurityAlert['globalChallengeLimitReached']>()
    .mockResolvedValue(undefined);
  const alert: SecurityAlert = { globalChallengeLimitReached };
  const service = new PasswordAuthService(
    challenges,
    identity,
    crypto,
    sender,
    limits,
    alert,
    ['hufs.ac.kr'],
    () => now,
    () => 'challenge-id',
    () => '123456',
  );

  return {
    service,
    createWithinLimits,
    findById,
    recordFailure,
    transition,
    userExists,
    createVerifiedUser,
    send,
    globalChallengeLimitReached,
  };
};

describe('비밀번호 인증', () => {
  it('가입 코드 발송 단계에서는 Cognito를 호출하거나 비밀번호를 저장하지 않는다', async () => {
    const {
      service,
      createWithinLimits,
      userExists,
      createVerifiedUser,
      send,
    } = createFixture();

    await expect(service.startSignup(' Student@HUFS.ac.kr ')).resolves.toEqual({
      challengeId: 'challenge-id',
    });

    expect(userExists).not.toHaveBeenCalled();
    expect(createVerifiedUser).not.toHaveBeenCalled();
    expect(createWithinLimits).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'student@hufs.ac.kr',
        purpose: 'SIGNUP',
        codeHmac: 'stored-code',
      }),
    );
    expect(createWithinLimits.mock.calls[0]?.[0]).not.toHaveProperty(
      'password',
    );
    expect(send).toHaveBeenCalledWith({
      email: 'student@hufs.ac.kr',
      code: '123456',
    });
  });

  it('코드 검증이 성공한 뒤에만 Cognito 회원을 만들고 비밀번호를 전달한다', async () => {
    const { service, createVerifiedUser } = createFixture();

    await expect(
      service.verifySignup('challenge-id', '123456', 'Strong1!'),
    ).resolves.toMatchObject({ accessToken: 'access' });

    expect(createVerifiedUser).toHaveBeenCalledWith(
      'student@hufs.ac.kr',
      'Strong1!',
    );
  });

  it('잘못된 코드는 Cognito 호출 없이 실패 횟수만 올린다', async () => {
    const { service, recordFailure, createVerifiedUser } = createFixture();

    await expect(
      service.verifySignup('challenge-id', '000000', 'Strong1!'),
    ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });

    expect(recordFailure).toHaveBeenCalledWith('challenge-id', 5);
    expect(createVerifiedUser).not.toHaveBeenCalled();
  });

  it('비밀번호 정책을 만족하지 않으면 코드를 소비하지 않는다', async () => {
    const { service, transition, createVerifiedUser } = createFixture();

    await expect(
      service.verifySignup('challenge-id', '123456', 'password'),
    ).rejects.toMatchObject({ code: 'PASSWORD_POLICY_VIOLATION' });

    expect(transition).not.toHaveBeenCalled();
    expect(createVerifiedUser).not.toHaveBeenCalled();
  });

  it('허용한 학교 도메인이 아닌 이메일은 저장 전에 거부한다', async () => {
    const { service, createWithinLimits } = createFixture();

    await expect(
      service.startSignup('student@gmail.com'),
    ).rejects.toMatchObject({ code: 'SCHOOL_EMAIL_REQUIRED' });
    expect(createWithinLimits).not.toHaveBeenCalled();
  });

  it('전체 발송 상한에 도달한 마지막 정상 요청에서 보안 알림을 보낸다', async () => {
    const { service, createWithinLimits, globalChallengeLimitReached } =
      createFixture();
    createWithinLimits.mockResolvedValueOnce({
      kind: 'CREATED',
      challenge: {
        id: 'challenge-id',
        email: 'student@hufs.ac.kr',
        purpose: 'SIGNUP',
        codeHmac: 'stored-code',
        attempts: 0,
        status: 'PENDING',
        expiresAt: new Date('2026-07-21T00:10:00.000Z'),
        createdAt: now,
      },
      globalLimitReached: true,
    });

    await service.startSignup('student@hufs.ac.kr');

    expect(globalChallengeLimitReached).toHaveBeenCalledWith(500);
  });

  it('비밀번호 재설정은 Cognito 조회 전에 발송 상한을 먼저 예약한다', async () => {
    const { service, createWithinLimits, userExists, send } = createFixture();
    userExists.mockResolvedValueOnce(false);

    await expect(
      service.startPasswordReset('student@hufs.ac.kr'),
    ).resolves.toEqual({ challengeId: 'challenge-id' });

    const createOrder = createWithinLimits.mock.invocationCallOrder[0];
    const lookupOrder = userExists.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(lookupOrder ?? 0);
    expect(send).not.toHaveBeenCalled();
  });
});
