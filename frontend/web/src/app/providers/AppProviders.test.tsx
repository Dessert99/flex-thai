/** 세션 bootstrap 차단과 사용자 경계 Query cache 정리를 검증한다 */
import type { MeResponse } from '@flex-thia/contracts';
import { act, render, screen } from '@testing-library/react';
import type { AuthSessionState, AuthSessionStore } from '@/shared/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => {
  let state: AuthSessionState = { status: 'restoring' };
  const listeners = new Set<() => void>();
  const store: AuthSessionStore = {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    restoreSession: vi.fn().mockResolvedValue(undefined),
    setState(nextState: AuthSessionState) {
      state = nextState;
      for (const listener of listeners) {
        listener();
      }
    },
    store,
  };
});

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    authSessionStore: authMocks.store,
    restoreSession: authMocks.restoreSession,
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    RouterProvider: () => <main>보호 콘텐츠</main>,
  };
});

import {
  AppProviders,
  createAppQueryClient,
  subscribeToSessionQueryCleanup,
} from './AppProviders';

const learner = createUser('01933b6a-8f13-7a19-b7e5-536d70f57aaa');
const anotherLearner = createUser('01933b6a-8f13-7a19-b7e5-536d70f57bbb');

beforeEach(() => {
  authMocks.restoreSession.mockClear();
  authMocks.setState({ status: 'restoring' });
});

describe('AppProviders bootstrap', () => {
  it('세션 복원이 끝나기 전 보호 콘텐츠를 노출하지 않는다', () => {
    render(<AppProviders />);

    expect(screen.getByRole('status')).toHaveTextContent(
      '세션을 확인하고 있습니다.',
    );
    expect(screen.queryByText('보호 콘텐츠')).not.toBeInTheDocument();
    expect(authMocks.restoreSession).toHaveBeenCalledOnce();

    act(() => {
      authMocks.setState({
        status: 'anonymous',
        reason: 'missing-session',
      });
    });
    expect(screen.getByText('보호 콘텐츠')).toBeInTheDocument();
  });

  it('Query production 기본값을 고정한다', () => {
    const queryClient = createAppQueryClient();

    expect(queryClient.getDefaultOptions()).toMatchObject({
      mutations: { retry: false },
      queries: {
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    });
  });
});

describe('사용자 경계 Query cache 정리', () => {
  it.each([
    { status: 'anonymous', reason: 'logged-out' },
    { status: 'anonymous', reason: 'expired' },
    { status: 'blocked', reason: 'account-disabled' },
  ] as const)('$status 전이에서 cache를 제거한다', (nextState) => {
    const queryClient = createAppQueryClient();
    const store = createMutableStore(createAuthenticatedState(learner));
    const unsubscribe = subscribeToSessionQueryCleanup(store, queryClient);
    queryClient.setQueryData(['me'], learner);

    store.setState(nextState);

    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    unsubscribe();
  });

  it('인증 subject가 바뀌면 이전 사용자 cache를 제거한다', () => {
    const queryClient = createAppQueryClient();
    const store = createMutableStore(createAuthenticatedState(learner));
    const unsubscribe = subscribeToSessionQueryCleanup(store, queryClient);
    queryClient.setQueryData(['me'], learner);

    store.setState(createAuthenticatedState(anotherLearner));

    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    unsubscribe();
  });

  it('실패한 logout처럼 동일 subject 인증 상태는 cache를 보존한다', () => {
    const queryClient = createAppQueryClient();
    const store = createMutableStore(createAuthenticatedState(learner));
    const unsubscribe = subscribeToSessionQueryCleanup(store, queryClient);
    queryClient.setQueryData(['me'], learner);

    store.setState(createAuthenticatedState(learner));

    expect(queryClient.getQueryData(['me'])).toEqual(learner);
    unsubscribe();
  });
});

function createUser(id: string): MeResponse {
  return {
    id,
    email: 'learner@example.com',
    role: 'LEARNER',
    mfaEnrolled: false,
  };
}

function createAuthenticatedState(user: MeResponse): AuthSessionState {
  return {
    status: 'authenticated',
    user,
    expiresAt: Date.now() + 3_600_000,
  };
}

function createMutableStore(initialState: AuthSessionState) {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => state,
    setState(nextState: AuthSessionState) {
      state = nextState;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
