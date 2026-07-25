/** 메모리 전용 인증 세션의 복원·차단·로그아웃 전이를 검증한다 */
import type { AuthenticatedResponse, MeResponse } from '@flex-thia/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ApiError';

const authApiMocks = vi.hoisted(() => ({
  requestLogout: vi.fn(),
  requestMe: vi.fn(),
  requestRefresh: vi.fn(),
}));

vi.mock('./authApi', () => authApiMocks);

const learner: MeResponse = {
  id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
  email: 'learner@example.com',
  role: 'LEARNER',
  mfaEnrolled: false,
};

const refreshed: AuthenticatedResponse = {
  status: 'AUTHENTICATED',
  accessToken: 'access-token',
  expiresIn: 3_600,
  user: { ...learner, mfaEnrolled: false },
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-25T00:00:00.000Z'));
  authApiMocks.requestLogout.mockReset();
  authApiMocks.requestMe.mockReset();
  authApiMocks.requestRefresh.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('인증 세션 복원', () => {
  it('refresh 후 /me 응답으로 재조정한 사용자만 공개한다', async () => {
    const reconciledUser = { ...learner, mfaEnrolled: true };
    authApiMocks.requestRefresh.mockResolvedValue(refreshed);
    authApiMocks.requestMe.mockResolvedValue(reconciledUser);
    const { authSessionStore, restoreSession } = await loadStore();

    await restoreSession();

    expect(authApiMocks.requestMe).toHaveBeenCalledWith('access-token');
    expect(authSessionStore.getSnapshot()).toEqual({
      status: 'authenticated',
      user: reconciledUser,
      expiresAt: Date.now() + 3_600_000,
    });
    expect(authSessionStore.getSnapshot()).not.toHaveProperty('accessToken');
  });

  it('유효하지 않은 refresh를 missing-session 익명 상태로 전환한다', async () => {
    authApiMocks.requestRefresh.mockRejectedValue(
      createProblemError(401, 'INVALID_REFRESH_TOKEN'),
    );
    const { authSessionStore, restoreSession } = await loadStore();

    await restoreSession();

    expect(authSessionStore.getSnapshot()).toEqual({
      status: 'anonymous',
      reason: 'missing-session',
    });
  });

  it('비활성 계정을 requestId가 있는 blocked 상태로 전환한다', async () => {
    authApiMocks.requestRefresh.mockRejectedValue(
      createProblemError(403, 'ACCOUNT_DISABLED'),
    );
    const { authSessionStore, restoreSession } = await loadStore();

    await restoreSession();

    expect(authSessionStore.getSnapshot()).toEqual({
      status: 'blocked',
      reason: 'account-disabled',
      requestId: 'request-ACCOUNT_DISABLED',
    });
  });

  it('일반 refresh 403을 CSRF 복원 오류로 전환한다', async () => {
    authApiMocks.requestRefresh.mockRejectedValue(
      createProblemError(403, 'HTTP_403'),
    );
    const { authSessionStore, restoreSession } = await loadStore();

    await restoreSession();

    expect(authSessionStore.getSnapshot()).toEqual({
      status: 'restore-error',
      reason: 'csrf',
      requestId: 'request-HTTP_403',
    });
  });

  it.each([
    [new ApiError({ kind: 'network' }), 'network'],
    [new ApiError({ kind: 'timeout' }), 'network'],
    [createProblemError(500, 'HTTP_500'), 'server'],
  ] as const)('%s를 %s 복원 오류로 전환한다', async (error, reason) => {
    authApiMocks.requestRefresh.mockRejectedValue(error);
    const { authSessionStore, restoreSession } = await loadStore();

    await restoreSession();

    expect(authSessionStore.getSnapshot()).toMatchObject({
      status: 'restore-error',
      reason,
    });
  });
});

describe('인증 세션 로그아웃', () => {
  it('서버 logout 성공 후에만 logged-out 익명 상태로 전환한다', async () => {
    const { authSessionStore, logoutSession } = await restoreAuthenticated();
    authApiMocks.requestLogout.mockResolvedValue(undefined);

    await logoutSession();

    expect(authSessionStore.getSnapshot()).toEqual({
      status: 'anonymous',
      reason: 'logged-out',
    });
  });

  it('서버 logout 실패 시 인증 상태를 유지한다', async () => {
    const { authSessionStore, logoutSession } = await restoreAuthenticated();
    authApiMocks.requestLogout.mockRejectedValue(
      new ApiError({ kind: 'network' }),
    );

    await expect(logoutSession()).rejects.toMatchObject({
      detail: { kind: 'network' },
    });
    expect(authSessionStore.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user: learner,
    });
  });
});

async function loadStore() {
  return import('./authSessionStore');
}

async function restoreAuthenticated() {
  authApiMocks.requestRefresh.mockResolvedValue(refreshed);
  authApiMocks.requestMe.mockResolvedValue(learner);
  const store = await loadStore();
  await store.restoreSession();
  return store;
}

function createProblemError(status: number, code: string) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: 'https://flex-thia.dev/problems/auth',
      title: '인증 실패',
      status,
      code,
      requestId: `request-${code}`,
      fieldErrors: [],
    },
  });
}
