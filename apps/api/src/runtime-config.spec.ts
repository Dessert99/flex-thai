/** API Lambda가 secret 원문 대신 Secrets Manager ARN으로 시작하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { loadApiRuntimeSource } from './runtime-config.js';

describe('loadApiRuntimeSource', () => {
  it('HMAC pepper ARN을 읽어 메모리 설정에만 원문을 추가한다', async () => {
    const read = vi.fn().mockResolvedValueOnce('secret-pepper');
    const source = await loadApiRuntimeSource(
      {
        CHALLENGE_HMAC_PEPPER_SECRET_ARN: 'pepper-arn',
      },
      { read },
    );

    expect(read).toHaveBeenCalledWith('pepper-arn');
    expect(source).toMatchObject({
      CHALLENGE_HMAC_PEPPER: 'secret-pepper',
    });
  });
});
