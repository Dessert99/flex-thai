/** Cognito custom challenge answer의 timing-safe 비교 결과를 검증한다 */
import { describe, expect, it } from 'vitest';
import { verifyAuthChallenge } from './verify-auth-challenge.js';

const makeEvent = (expectedHmac: string, answer: string) => ({
  request: {
    privateChallengeParameters: { expectedHmac },
    challengeAnswer: answer,
  },
  response: { answerCorrect: false },
});

describe('verifyAuthChallenge', () => {
  it('private HMAC과 answer가 같을 때만 성공한다', () => {
    const result = verifyAuthChallenge(
      makeEvent('opaque-answer', 'opaque-answer'),
    );

    expect(result.response.answerCorrect).toBe(true);
  });

  it('길이가 다른 answer도 예외 없이 거부한다', () => {
    const result = verifyAuthChallenge(makeEvent('opaque-answer', 'short'));

    expect(result.response.answerCorrect).toBe(false);
  });
});
