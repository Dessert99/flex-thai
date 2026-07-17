/** Cognito trigger가 HMAC challenge 생성과 답 검증 use case만 호출하게 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { createAuthChallengeHandler } from './create-auth-challenge.js';
import { createVerifyAuthChallengeHandler } from './verify-auth-challenge.js';

describe('createAuthChallengeHandler', () => {
  it('code와 link token은 HMAC만 저장하고 이메일 sender로 원문을 보낸다', async () => {
    const repository = { create: vi.fn().mockResolvedValue({}) };
    const crypto = {
      hashAnswer: vi.fn((value: string) => `hashed-${value}`),
    };
    const sender = { send: vi.fn().mockResolvedValue(undefined) };
    const handler = createAuthChallengeHandler({
      repository: repository as never,
      crypto: crypto as never,
      sender,
      generateCode: () => '123456',
      generateLinkToken: () => 'raw-link-token',
      generateChallengeId: () => 'challenge-id',
      now: () => new Date('2026-07-17T00:00:00.000Z'),
    });
    const event = {
      request: { userAttributes: { email: 'student@school.ac.kr' } },
      response: {},
    };

    await handler(event as never);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        codeHmac: 'hashed-123456',
        linkHmac: 'hashed-raw-link-token',
      }),
    );
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '123456',
        linkToken: 'raw-link-token',
      }),
    );
  });
});

describe('createVerifyAuthChallengeHandler', () => {
  it('private challenge id와 JSON answer를 검증 use case에 전달한다', async () => {
    const execute = vi.fn().mockResolvedValue(true);
    const handler = createVerifyAuthChallengeHandler({ execute });
    const event = {
      request: {
        privateChallengeParameters: { challengeId: 'challenge-id' },
        challengeAnswer: JSON.stringify({
          kind: 'LINK',
          answer: 'raw-link-token',
        }),
      },
      response: {},
    };

    await handler(event as never);

    expect(execute).toHaveBeenCalledWith({
      challengeId: 'challenge-id',
      kind: 'LINK',
      answer: 'raw-link-token',
    });
    expect(event.response).toMatchObject({ answerCorrect: true });
  });
});
