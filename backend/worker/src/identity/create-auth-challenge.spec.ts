/** Cognito 공개 nonce와 server-only proof 분리를 검증한다 */
import { describe, expect, it } from 'vitest';
import { createAuthChallenge } from './create-auth-challenge.js';

describe('createAuthChallenge', () => {
  it('고엔트로피 nonce만 공개하고 server-only HMAC은 private에 둔다', () => {
    const event = {
      userName: 'user@hufs.ac.kr',
      request: {},
      response: {
        publicChallengeParameters: {},
        privateChallengeParameters: {},
      },
    };

    const result = createAuthChallenge(
      event,
      'server-only-custom-auth-secret-32-bytes',
      () => 'N'.repeat(43),
    );

    expect(result.response.publicChallengeParameters).toEqual({
      challenge: 'EMAIL_VERIFIED',
      nonce: 'N'.repeat(43),
    });
    expect(result.response.privateChallengeParameters).toEqual({
      expectedHmac: 'NZFZpahjQr6-zL8rvTIZDr90ekfluOsj0etiYk9-gms',
    });
    expect(
      JSON.stringify(result.response.publicChallengeParameters),
    ).not.toContain('NZFZpahjQr6-zL8rvTIZDr90ekfluOsj0etiYk9-gms');
  });
});
