/** API 런타임이 배포 환경의 challenge secret을 안전하게 해석하는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { AwsApiSecretReader, loadApiRuntimeSource } from './runtime-config.js';

describe('loadApiRuntimeSource', () => {
  it('인증 secret ARN들을 실제 런타임 값으로 해석한다', async () => {
    const read = vi.fn().mockImplementation((arn: string) => {
      return Promise.resolve(
        arn === 'custom-auth-arn' ? 'custom-auth-secret' : 'secret-pepper',
      );
    });
    const source = await loadApiRuntimeSource(
      {
        CUSTOM_AUTH_SECRET_ARN: 'custom-auth-arn',
        CHALLENGE_HMAC_PEPPER_SECRET_ARN: 'pepper-arn',
      },
      { read },
    );

    expect(read).toHaveBeenCalledWith('custom-auth-arn');
    expect(read).toHaveBeenCalledWith('pepper-arn');
    expect(source).toEqual({
      CUSTOM_AUTH_SECRET: 'custom-auth-secret',
      CUSTOM_AUTH_SECRET_ARN: 'custom-auth-arn',
      CHALLENGE_HMAC_PEPPER: 'secret-pepper',
      CHALLENGE_HMAC_PEPPER_SECRET_ARN: 'pepper-arn',
    });
  });

  it('ARN이 있으면 직접 전달된 값보다 secret 원문을 우선한다', async () => {
    const read = vi.fn().mockResolvedValue('resolved-secret');

    const source = await loadApiRuntimeSource(
      {
        CHALLENGE_HMAC_PEPPER: 'direct-pepper',
        CHALLENGE_HMAC_PEPPER_SECRET_ARN: 'pepper-arn',
      },
      { read },
    );

    expect(read).toHaveBeenCalledWith('pepper-arn');
    expect(source.CHALLENGE_HMAC_PEPPER).toBe('resolved-secret');
  });

  it('production의 직접 주입된 인증 secret을 거부한다', async () => {
    await expect(
      loadApiRuntimeSource(
        {
          NODE_ENV: 'production',
          CUSTOM_AUTH_SECRET: 'plain-custom-auth-secret',
          CUSTOM_AUTH_SECRET_ARN: 'custom-auth-arn',
        },
        { read: vi.fn() },
      ),
    ).rejects.toThrow('production 인증 secret은 ARN으로만 전달해야 합니다');
  });

  it('같은 ARN의 SecretString을 cold start 안에서 한 번만 읽는다', async () => {
    const send = vi.fn().mockResolvedValue({ SecretString: 'cached-secret' });
    const reader = new AwsApiSecretReader({ send } as never);

    await expect(reader.read('secret-arn')).resolves.toBe('cached-secret');
    await expect(reader.read('secret-arn')).resolves.toBe('cached-secret');

    expect(send).toHaveBeenCalledTimes(1);
  });
});
