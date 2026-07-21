/** Parameter Store의 세 상한값을 숫자로 변환하고 짧게 캐시함을 고정한다 */
import { describe, expect, it, vi } from 'vitest';
import { SsmChallengeLimitProvider } from './ssm-challenge-limit.provider.js';

describe('SSM 인증 상한 provider', () => {
  it('세 Parameter 값을 읽어 상한으로 반환한다', async () => {
    const send = vi.fn().mockResolvedValue({
      Parameters: [
        {
          Name: '/flex-thia/prod/auth/challenge-cooldown-seconds',
          Value: '60',
        },
        {
          Name: '/flex-thia/prod/auth/challenge-email-daily-limit',
          Value: '5',
        },
        {
          Name: '/flex-thia/prod/auth/challenge-global-daily-limit',
          Value: '500',
        },
      ],
    });
    const provider = new SsmChallengeLimitProvider(
      { send } as never,
      '/flex-thia/prod/auth',
    );

    await expect(provider.getLimits()).resolves.toEqual({
      cooldownSeconds: 60,
      perEmailPerDay: 5,
      globalPerDay: 500,
    });
  });
});
