/** API Lambda가 secret 원문 대신 Secrets Manager ARN으로 시작하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { loadApiRuntimeSource } from './runtime-config.js';

describe('loadApiRuntimeSource', () => {
  it('두 secret ARN을 읽어 메모리 설정에만 원문을 추가한다', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce('12345678901234567890123456789012')
      .mockResolvedValueOnce('secret-pepper');
    const source = await loadApiRuntimeSource(
      {
        CHALLENGE_SESSION_KEY_SECRET_ARN: 'session-key-arn',
        CHALLENGE_HMAC_PEPPER_SECRET_ARN: 'pepper-arn',
      },
      { read },
    );

    expect(read).toHaveBeenNthCalledWith(1, 'session-key-arn');
    expect(read).toHaveBeenNthCalledWith(2, 'pepper-arn');
    expect(source).toMatchObject({
      CHALLENGE_SESSION_KEY: '12345678901234567890123456789012',
      CHALLENGE_HMAC_PEPPER: 'secret-pepper',
    });
  });
});
