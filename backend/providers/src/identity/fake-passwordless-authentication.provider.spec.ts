/** local passwordless provider의 role별 결과와 운영 차단을 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakePasswordlessAuthenticationProvider } from './fake-passwordless-authentication.provider.js';

const accounts = [
  {
    email: 'learner@hufs.ac.kr',
    subject: 'learner-sub',
    role: 'LEARNER' as const,
  },
  {
    email: 'admin@hufs.ac.kr',
    subject: 'admin-sub',
    role: 'ADMIN' as const,
  },
];

describe('FakePasswordlessAuthenticationProvider', () => {
  it('학습자는 password 없이 token을 받는다', async () => {
    const provider = new FakePasswordlessAuthenticationProvider({
      mode: 'local',
      accounts,
    });

    await expect(
      provider.complete('learner@hufs.ac.kr'),
    ).resolves.toMatchObject({
      kind: 'AUTHENTICATED',
      tokens: { subject: 'learner-sub', email: 'learner@hufs.ac.kr' },
    });
  });

  it('관리자는 SOFTWARE_TOKEN_MFA와 고정 local code를 거친다', async () => {
    const provider = new FakePasswordlessAuthenticationProvider({
      mode: 'test',
      accounts,
    });

    const result = await provider.complete('admin@hufs.ac.kr');
    expect(result).toMatchObject({ kind: 'MFA_REQUIRED' });
    if (result.kind !== 'MFA_REQUIRED') {
      throw new Error('관리자 MFA challenge가 필요합니다');
    }
    await expect(
      provider.completeTotpChallenge({
        email: 'admin@hufs.ac.kr',
        challengeToken: result.challengeToken,
        code: '123456',
      }),
    ).resolves.toMatchObject({ subject: 'admin-sub' });
  });

  it('production mode에서는 fake 구성을 즉시 거부한다', () => {
    expect(
      () =>
        new FakePasswordlessAuthenticationProvider({
          mode: 'production',
          accounts,
        }),
    ).toThrow('production');
  });
});
