/** Cognito custom challenge의 token 발급과 최대 실패 횟수를 검증한다 */
import { describe, expect, it } from 'vitest';
import { defineAuthChallenge } from './define-auth-challenge.js';

const makeEvent = (
  session: Array<{ challengeName: string; challengeResult: boolean }>,
) => ({
  request: { session },
  response: {
    issueTokens: false,
    failAuthentication: false,
  },
});

describe('defineAuthChallenge', () => {
  it('성공한 custom challenge 뒤 token 발급을 지시한다', () => {
    const result = defineAuthChallenge(
      makeEvent([{ challengeName: 'CUSTOM_CHALLENGE', challengeResult: true }]),
    );

    expect(result.response).toMatchObject({
      issueTokens: true,
      failAuthentication: false,
    });
  });

  it('다섯 번 실패하면 더 이상 challenge를 만들지 않는다', () => {
    const result = defineAuthChallenge(
      makeEvent(
        Array.from({ length: 5 }, () => ({
          challengeName: 'CUSTOM_CHALLENGE',
          challengeResult: false,
        })),
      ),
    );

    expect(result.response).toMatchObject({
      issueTokens: false,
      failAuthentication: true,
    });
  });
});
