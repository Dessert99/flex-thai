/** 세션 bootstrap·Query cache·Router 수명주기를 애플리케이션 경계에서 조정한다 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  authSessionStore,
  restoreSession,
  shouldRetryQuery,
  type AuthSessionState,
  type AuthSessionStore,
} from '@/shared/api';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import { createAppRouter } from '../router';

/** production cache freshness와 자동 재시도 경계를 가진 QueryClient를 생성한다 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
        staleTime: 30_000,
      },
    },
  });
}

/** 인증 subject 종료·차단·교체 시 이전 사용자 Query cache를 제거한다 */
export function subscribeToSessionQueryCleanup(
  store: AuthSessionStore,
  queryClient: QueryClient,
): () => void {
  let activeSubject = readSubject(store.getSnapshot());

  return store.subscribe(() => {
    const nextState = store.getSnapshot();
    const nextSubject = readSubject(nextState);
    const subjectEnded =
      activeSubject !== undefined &&
      (nextState.status === 'anonymous' || nextState.status === 'blocked');
    const subjectChanged =
      activeSubject !== undefined &&
      nextSubject !== undefined &&
      activeSubject !== nextSubject;

    if (subjectEnded || subjectChanged) {
      queryClient.clear();
    }
    if (
      nextState.status === 'authenticated' ||
      nextState.status === 'anonymous' ||
      nextState.status === 'blocked'
    ) {
      activeSubject = nextSubject;
    }
  });
}

/** 세션 복원 결과가 안전할 때만 Query와 Router provider를 노출한다 */
export function AppProviders() {
  const session = useSyncExternalStore(
    (listener) => authSessionStore.subscribe(listener),
    () => authSessionStore.getSnapshot(),
  );
  const [queryClient] = useState(createAppQueryClient);
  const [router] = useState(() => createAppRouter(queryClient));

  useEffect(() => {
    const unsubscribe = subscribeToSessionQueryCleanup(
      authSessionStore,
      queryClient,
    );
    void restoreSession();
    return unsubscribe;
  }, [queryClient]);

  if (session.status === 'restoring') {
    return (
      <RecoveryShell>
        <PageLoading message='세션을 확인하고 있습니다.' />
      </RecoveryShell>
    );
  }
  if (session.status === 'blocked') {
    return (
      <RecoveryShell>
        <PageEmpty
          description='계정 상태를 확인하려면 관리자에게 문의해 주세요.'
          title='이 계정은 현재 사용할 수 없습니다.'
        />
      </RecoveryShell>
    );
  }
  if (session.status === 'restore-error') {
    return (
      <RecoveryShell>
        <PageError
          message='세션을 확인하지 못했습니다. 다시 시도해 주세요.'
          onRetry={() => {
            void restoreSession();
          }}
          {...(session.requestId === undefined
            ? {}
            : { requestId: session.requestId })}
        />
      </RecoveryShell>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

function readSubject(state: AuthSessionState): string | undefined {
  return state.status === 'authenticated' ? state.user.id : undefined;
}

function RecoveryShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className='grid min-h-screen place-items-center bg-surface p-page'
      id='app-main'
      tabIndex={-1}
    >
      <div className='w-full max-w-content'>{children}</div>
    </main>
  );
}
