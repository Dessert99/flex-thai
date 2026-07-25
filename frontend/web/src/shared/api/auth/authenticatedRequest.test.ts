/** 인증 요청의 단일 refresh·1회 replay·403 비재시도 경계를 검증한다 */
import type { AuthenticatedResponse, MeResponse } from '@flex-thia/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ApiError';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  requestLogout: vi.fn(),
  requestMe: vi.fn(),
  requestRefresh: vi.fn(),
}));

vi.mock('../apiRequest', () => ({ apiRequest: mocks.apiRequest }));
vi.mock('./authApi', () => ({
  requestLogout: mocks.requestLogout,
  requestMe: mocks.requestMe,
  requestRefresh: mocks.requestRefresh,
}));

const user: MeResponse = {
  id: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
  email: 'learner@example.com',
  role: 'LEARNER',
  mfaEnrolled: false,
};

const refreshed: AuthenticatedResponse = {
  status: 'AUTHENTICATED',
  accessToken: 'refreshed-access-token',
  expiresIn: 3_600,
  user,
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mocks.apiRequest.mockReset();
  mocks.requestLogout.mockReset();
  mocks.requestMe.mockReset();
  mocks.requestRefresh.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('authenticatedRequest', () => {
  it('동시에 발생한 401 요청은 하나의 refresh Promise를 공유한다', async () => {
    const { authenticatedRequest } = await restoreAuthenticated();
    mocks.requestRefresh.mockClear();
    const refreshDeferred = createDeferred<AuthenticatedResponse>();
    mocks.requestRefresh.mockReturnValue(refreshDeferred.promise);
    mocks.requestMe.mockResolvedValue(user);
    mocks.apiRequest
      .mockRejectedValueOnce(createProblemError(401, 'ACCESS_EXPIRED'))
      .mockRejectedValueOnce(createProblemError(401, 'ACCESS_EXPIRED'))
      .mockRejectedValueOnce(createProblemError(401, 'ACCESS_EXPIRED'))
      .mockResolvedValue({ value: 'ok' });

    const requests = [
      authenticatedRequest(requestOptions),
      authenticatedRequest(requestOptions),
      authenticatedRequest(requestOptions),
    ];
    await vi.waitFor(() => {
      expect(mocks.requestRefresh).toHaveBeenCalledOnce();
    });
    refreshDeferred.resolve(refreshed);

    await expect(Promise.all(requests)).resolves.toEqual([
      { value: 'ok' },
      { value: 'ok' },
      { value: 'ok' },
    ]);
    expect(mocks.requestRefresh).toHaveBeenCalledOnce();
  });

  it('replay된 요청의 두 번째 401은 세션을 만료시킨다', async () => {
    const { authenticatedRequest, authSessionStore } =
      await restoreAuthenticated();
    mocks.requestRefresh.mockClear();
    mocks.requestRefresh.mockResolvedValue(refreshed);
    mocks.requestMe.mockResolvedValue(user);
    mocks.apiRequest.mockRejectedValue(
      createProblemError(401, 'ACCESS_EXPIRED'),
    );

    await expect(authenticatedRequest(requestOptions)).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(mocks.requestRefresh).toHaveBeenCalledOnce();
    expect(authSessionStore.getSnapshot()).toEqual({
      status: 'anonymous',
      reason: 'expired',
    });
  });

  it('403은 refresh하지 않고 비활성 계정을 blocked로 전환한다', async () => {
    const { authenticatedRequest, authSessionStore } =
      await restoreAuthenticated();
    mocks.requestRefresh.mockClear();
    mocks.apiRequest.mockRejectedValue(
      createProblemError(403, 'ACCOUNT_DISABLED'),
    );

    await expect(authenticatedRequest(requestOptions)).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(mocks.requestRefresh).not.toHaveBeenCalled();
    expect(authSessionStore.getSnapshot()).toMatchObject({
      status: 'blocked',
      reason: 'account-disabled',
    });
  });

  it('auth endpoint의 401은 refresh하거나 replay하지 않는다', async () => {
    const { authenticatedRequest } = await restoreAuthenticated();
    mocks.requestRefresh.mockClear();
    mocks.apiRequest.mockRejectedValue(
      createProblemError(401, 'ACCESS_EXPIRED'),
    );

    await expect(
      authenticatedRequest({
        ...requestOptions,
        path: '/auth/mfa/totp/setup',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(mocks.requestRefresh).not.toHaveBeenCalled();
    expect(mocks.apiRequest).toHaveBeenCalledOnce();
  });
});

const requestOptions = {
  path: '/questions',
  response: { kind: 'empty' } as const,
};

async function restoreAuthenticated() {
  mocks.requestRefresh.mockResolvedValue(refreshed);
  mocks.requestMe.mockResolvedValue(user);
  const store = await import('./authSessionStore');
  const request = await import('./authenticatedRequest');
  await store.restoreSession();
  return { ...store, ...request };
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

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      resolvePromise?.(value);
    },
  };
}
