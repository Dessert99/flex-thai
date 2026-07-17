/** 학교 이메일 제한과 challenge 최대 실패 횟수를 고정하는 인증 테스트 */
import { describe, expect, it, vi } from 'vitest';
import {
  PasswordlessAuthService,
  VerifyChallengeAnswerService,
} from './passwordless-auth.service.js';
import type { AuthChallenge } from './challenge.js';

describe('VerifyChallengeAnswerService', () => {
  it('다섯 번째 오답 뒤 challenge를 취소하고 정답 재사용도 막는다', async () => {
    let challenge: AuthChallenge = {
      id: 'challenge-id',
      codeHmac: 'code-hmac',
      linkHmac: 'link-hmac',
      sessionCiphertext: null,
      attempts: 0,
      status: 'PENDING',
      expiresAt: new Date('2026-07-17T00:10:00.000Z'),
    };
    const repository = {
      create: vi.fn(),
      findById: vi.fn(() => Promise.resolve(challenge)),
      attachSession: vi.fn(),
      recordFailure: vi.fn(() => {
        const attempts = challenge.attempts + 1;
        challenge = {
          ...challenge,
          attempts,
          status: attempts >= 5 ? 'CANCELLED' : 'PENDING',
        };
        return Promise.resolve(challenge);
      }),
      transition: vi.fn((_id: string, status: 'SUCCEEDED' | 'EXPIRED') => {
        if (challenge.status !== 'PENDING') {
          return Promise.resolve(false);
        }

        challenge = { ...challenge, status };
        return Promise.resolve(true);
      }),
    };
    const crypto = {
      hashAnswer: vi.fn(),
      verifyAnswer: vi.fn((answer: string) => answer === 'correct'),
      encryptSession: vi.fn(),
      decryptSession: vi.fn(),
    };
    const service = new VerifyChallengeAnswerService(
      repository,
      crypto,
      () => new Date('2026-07-17T00:00:00.000Z'),
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.execute({
          challengeId: 'challenge-id',
          kind: 'CODE',
          answer: 'wrong',
        }),
      ).resolves.toBe(false);
    }

    await expect(
      service.execute({
        challengeId: 'challenge-id',
        kind: 'CODE',
        answer: 'correct',
      }),
    ).resolves.toBe(false);
    expect(challenge.status).toBe('CANCELLED');
  });
});

describe('PasswordlessAuthService', () => {
  it('허용한 학교 domain이 아닌 이메일은 identity provider 전에 거부한다', async () => {
    const identity = {
      ensureUser: vi.fn(),
      start: vi.fn(),
      respond: vi.fn(),
      refresh: vi.fn(),
      revoke: vi.fn(),
    };
    const service = new PasswordlessAuthService(
      {} as never,
      identity,
      {} as never,
      ['school.ac.kr'],
    );

    await expect(service.start('student@gmail.com')).rejects.toMatchObject({
      code: 'SCHOOL_EMAIL_REQUIRED',
    });
    expect(identity.ensureUser).not.toHaveBeenCalled();
  });
});
