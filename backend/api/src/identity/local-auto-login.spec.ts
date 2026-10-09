/** 개발 자동 로그인의 사용자·권한 보존과 오류 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { readApiEnv } from '@flex-thia/config/api-env';
import { IdentityAuthenticationService } from '@flex-thia/domain/identity/authentication.service';
import type { IdentityUser } from '@flex-thia/domain/identity/user.repository';
import { FakePasswordlessAuthenticationProvider } from '@flex-thia/providers/identity/fake-passwordless-authentication.provider';
import { createLocalAutoLogin } from './local-auto-login.js';

function setup(overrides: Partial<IdentityUser> = {}) {
  let user: IdentityUser = {
    id: '00000000-0000-4000-8000-000000000002',
    cognitoSub: 'local-learner-sub',
    email: 'learner@hufs.ac.kr',
    role: 'LEARNER',
    status: 'ACTIVE',
    mfaEnrolledAt: null,
    ...overrides,
  };
  const users = {
    findBySub: vi.fn(() => Promise.resolve(user)),
    upsertIdentity: vi.fn(() => Promise.resolve(user)),
    markMfaEnrolled: vi.fn((_subject: string, date: Date) => {
      user = { ...user, mfaEnrolledAt: date };
      return Promise.resolve(user);
    }),
  };
  const provider = new FakePasswordlessAuthenticationProvider({
    mode: 'local',
    accounts: [
      { email: user.email, subject: user.cognitoSub, role: 'LEARNER' },
    ],
  });
  const identity = new IdentityAuthenticationService(provider, users);
  const env = readApiEnv({ LOCAL_AUTO_LOGIN: 'true' });
  const login = createLocalAutoLogin(env, provider, identity)!;
  return { login, env, provider, identity, users };
}

describe('로컬 개발 자동 로그인', () => {
  it('입력 없이 DB 사용자 ID와 guard에서 인식할 수 있는 세션을 만든다', async () => {
    const { login, provider, users } = setup();
    const result = await login();
    expect(result.kind).toBe('AUTHENTICATED');
    if (result.kind !== 'AUTHENTICATED') throw new Error('자동 로그인 실패');
    expect(result.user).toMatchObject({
      id: '00000000-0000-4000-8000-000000000002',
      role: 'LEARNER',
    });
    expect(result.user.mfaEnrolledAt).toBeNull();
    expect(provider.resolveAccessTokenSubject(result.tokens.accessToken)).toBe(
      'local-learner-sub',
    );
    const refreshed = await login(result.tokens.refreshToken);
    expect(refreshed).toMatchObject({
      kind: 'AUTHENTICATED',
      user: result.user,
    });
    expect(users.markMfaEnrolled).not.toHaveBeenCalled();
  });

  it('API 재시작으로 무효화된 쿠키는 새 개발 세션으로 복구한다', async () => {
    const { login } = setup();
    await expect(login('이전-프로세스-token')).resolves.toMatchObject({
      kind: 'AUTHENTICATED',
    });
  });

  it('DB에 저장된 학습자 권한을 유지한다', async () => {
    const { login, users } = setup({ role: 'LEARNER' });
    await expect(login()).resolves.toMatchObject({
      user: { role: 'LEARNER', mfaEnrolledAt: null },
    });
    expect(users.markMfaEnrolled).not.toHaveBeenCalled();
  });

  it('비활성 계정은 자동 로그인으로 우회할 수 없다', async () => {
    const { login, users } = setup({ status: 'DISABLED' });
    await expect(login()).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    expect(users.markMfaEnrolled).not.toHaveBeenCalled();
  });

  it('유효한 세션에서 DB 장애가 발생하면 새 계정으로 로그인하지 않는다', async () => {
    const { login, users } = setup();
    const result = await login();
    if (result.kind !== 'AUTHENTICATED') throw new Error('자동 로그인 실패');
    users.upsertIdentity.mockRejectedValueOnce(new Error('DB 연결 실패'));
    await expect(login(result.tokens.refreshToken)).rejects.toThrow(
      'DB 연결 실패',
    );
    expect(users.upsertIdentity).toHaveBeenCalledTimes(2);
  });

  it('비활성 설정은 기존 인증 흐름을 사용하며 운영 환경은 재검증한다', () => {
    const { env, provider, identity } = setup();
    expect(
      createLocalAutoLogin(
        { ...env, LOCAL_AUTO_LOGIN: false },
        provider,
        identity,
      ),
    ).toBeUndefined();
    expect(() =>
      createLocalAutoLogin(
        { ...env, NODE_ENV: 'production' },
        provider,
        identity,
      ),
    ).toThrow('로컬 개발용');
  });
});
