/** Cognito 공개 nonce와 server-only proof 및 secret ARN 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildCreateAuthChallenge,
  createCreateAuthChallengeHandler,
  createCustomAuthSecretLoader,
} from './create-auth-challenge.js';

describe('Create Auth Challenge', () => {
  it('고엔트로피 nonce만 공개하고 server-only HMAC은 private에 둔다', () => {
    const event = {
      userName: 'user@hufs.ac.kr',
      request: {},
      response: {
        publicChallengeParameters: {},
        privateChallengeParameters: {},
      },
    };

    const result = buildCreateAuthChallenge(
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

  it('Secrets Manager ARN을 한 번만 읽어 cold-start 실행 환경에서 재사용한다', async () => {
    const send = vi.fn().mockResolvedValue({
      SecretString: 'server-only-custom-auth-secret-32-bytes',
    });
    const loadSecret = createCustomAuthSecretLoader(
      { send },
      { CUSTOM_AUTH_SECRET_ARN: 'custom-auth-secret-arn' },
    );

    const [first, second] = await Promise.all([loadSecret(), loadSecret()]);

    expect(first).toBe('server-only-custom-auth-secret-32-bytes');
    expect(second).toBe(first);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { SecretId: 'custom-auth-secret-arn' },
      }),
    );
  });

  it('평문 env만 있으면 사용하지 않고 secret ARN 누락으로 실패한다', async () => {
    const send = vi.fn();
    const loadSecret = createCustomAuthSecretLoader(
      { send },
      { CUSTOM_AUTH_SECRET: 'plaintext-must-not-be-used' },
    );

    await expect(loadSecret()).rejects.toThrow(
      'CUSTOM_AUTH_SECRET_ARN이 필요합니다',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('일시적인 Secrets Manager 실패는 cache에서 제거해 다음 호출이 재시도한다', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary Secrets Manager failure'))
      .mockResolvedValueOnce({
        SecretString: 'server-only-custom-auth-secret-32-bytes',
      });
    const loadSecret = createCustomAuthSecretLoader(
      { send },
      { CUSTOM_AUTH_SECRET_ARN: 'custom-auth-secret-arn' },
    );

    await expect(loadSecret()).rejects.toThrow(
      'temporary Secrets Manager failure',
    );
    await expect(loadSecret()).resolves.toBe(
      'server-only-custom-auth-secret-32-bytes',
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('Lambda Context를 secret 인자로 오인하지 않는 async wrapper를 만든다', async () => {
    const loadSecret = vi
      .fn()
      .mockResolvedValue('server-only-custom-auth-secret-32-bytes');
    const handler = createCreateAuthChallengeHandler(loadSecret, () =>
      'N'.repeat(43),
    );
    const event = {
      userName: 'user@hufs.ac.kr',
      request: {},
      response: {
        publicChallengeParameters: {},
        privateChallengeParameters: {},
      },
    };

    const result = await handler(event, { awsRequestId: 'request-id' });

    expect(loadSecret).toHaveBeenCalledTimes(1);
    expect(result.response.privateChallengeParameters).toEqual({
      expectedHmac: 'NZFZpahjQr6-zL8rvTIZDr90ekfluOsj0etiYk9-gms',
    });
  });
});
