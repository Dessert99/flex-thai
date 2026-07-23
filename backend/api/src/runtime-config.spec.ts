/** Identity MVP가 legacy challenge secret을 읽지 않는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { loadApiRuntimeSource } from './runtime-config.js';

describe('loadApiRuntimeSource', () => {
  it('입력 설정을 복사하고 legacy secret reader를 호출하지 않는다', async () => {
    const read = vi.fn().mockResolvedValueOnce('secret-pepper');
    const source = await loadApiRuntimeSource(
      {
        CHALLENGE_HMAC_PEPPER_SECRET_ARN: 'pepper-arn',
      },
      { read },
    );

    expect(read).not.toHaveBeenCalled();
    expect(source).toEqual({
      CHALLENGE_HMAC_PEPPER_SECRET_ARN: 'pepper-arn',
    });
  });
});
