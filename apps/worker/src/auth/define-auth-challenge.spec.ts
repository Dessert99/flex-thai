/** Cognito session 이력으로 custom challenge와 token 발급을 결정한다 */
import { describe, expect, it } from 'vitest';
import { applyDefineAuthChallenge } from './define-auth-challenge.js';

describe('applyDefineAuthChallenge', () => {
  it('첫 요청에는 custom challenge를 시작한다', () => {
    const event = {
      request: { session: [] },
      response: {},
    };

    expect(applyDefineAuthChallenge(event as never).response).toMatchObject({
      challengeName: 'CUSTOM_CHALLENGE',
      issueTokens: false,
      failAuthentication: false,
    });
  });

  it('직전 custom challenge가 성공하면 token을 발급한다', () => {
    const event = {
      request: {
        session: [
          {
            challengeName: 'CUSTOM_CHALLENGE',
            challengeResult: true,
          },
        ],
      },
      response: {},
    };

    expect(applyDefineAuthChallenge(event as never).response).toMatchObject({
      issueTokens: true,
      failAuthentication: false,
    });
  });
});
