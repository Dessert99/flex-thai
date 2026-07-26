/** Cognito 공개 challenge parameter에 secret이 없는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { createAuthChallenge } from './create-auth-challenge.js';

describe('createAuthChallenge', () => {
  it('답 HMAC은 private parameter에만 보존한다', async () => {
    const event = {
      request: {
        clientMetadata: { expectedHmac: 'opaque-answer-hmac' },
      },
      response: {
        publicChallengeParameters: {},
        privateChallengeParameters: {},
      },
    };

    const result = await createAuthChallenge(event);

    expect(result.response.publicChallengeParameters).toEqual({
      challenge: 'EMAIL_VERIFIED',
    });
    expect(result.response.privateChallengeParameters).toEqual({
      expectedHmac: 'opaque-answer-hmac',
    });
    expect(JSON.stringify(result.response.publicChallengeParameters)).not
      .toContain('opaque-answer-hmac');
  });
});
