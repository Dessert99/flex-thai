/** Cognito trigger가 환경 변수에 secret 원문을 요구하지 않게 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { createAuthTriggerRuntime } from './runtime.js';

describe('createAuthTriggerRuntime', () => {
  it('Secrets Manager ARN으로 AES key와 HMAC pepper를 읽는다', async () => {
    vi.stubEnv('DATABASE_MODE', 'local');
    vi.stubEnv('DATABASE_URL', 'postgres://local/test');
    vi.stubEnv('CHALLENGE_SESSION_KEY_SECRET_ARN', 'session-key-arn');
    vi.stubEnv('CHALLENGE_HMAC_PEPPER_SECRET_ARN', 'pepper-arn');
    const read = vi
      .fn()
      .mockResolvedValueOnce('12345678901234567890123456789012')
      .mockResolvedValueOnce('secret-pepper');

    const runtime = await createAuthTriggerRuntime({ read });
    const stored = runtime.crypto.hashAnswer('123456');

    expect(read).toHaveBeenNthCalledWith(1, 'session-key-arn');
    expect(read).toHaveBeenNthCalledWith(2, 'pepper-arn');
    expect(runtime.crypto.verifyAnswer('123456', stored)).toBe(true);
    vi.unstubAllEnvs();
  });
});
