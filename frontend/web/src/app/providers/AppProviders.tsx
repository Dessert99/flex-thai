/** 세션 bootstrap·Query cache·Router 수명주기를 애플리케이션 경계에서 조정한다 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  authSessionStore,
  restoreSession,
  type AuthSessionState,
  type AuthSessionStore,
} from '@/shared/apis/auth/authSessionStore';
import { shouldRetryQuery } from '@/shared/apis/retryPolicy';

import { createAppRouter } from '../router';
import { Skeleton } from '@/shared/components/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';

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

/** 공개 홈은 즉시 표시하고 나머지 경로는 세션 복원 결과를 확인한다 */
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

  const pathname = useSyncExternalStore(
    (listener) => router.history.subscribe(() => listener()),
    () => router.history.location.pathname,
  );
  if (pathname === '/') {
    return (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  }

  if (session.status === 'restoring') {
    return (
      <main
        className='grid min-h-screen place-items-center bg-background p-page'
        id='app-main'
        tabIndex={-1}
      >
        <div className='w-full max-w-content'>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>세션을 확인하고 있습니다.</p>
          </section>
        </div>
      </main>
    );
  }
  if (session.status === 'blocked') {
    return (
      <main
        className='grid min-h-screen place-items-center bg-background p-page'
        id='app-main'
        tabIndex={-1}
      >
        <div className='w-full max-w-content'>
          <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
            <h2 className='text-title text-primary'>
              이 계정은 현재 사용할 수 없습니다.
            </h2>
            <p className='text-body text-subtle'>
              계정 상태를 확인하려면 관리자에게 문의해 주세요.
            </p>
          </section>
        </div>
      </main>
    );
  }
  if (session.status === 'restore-error') {
    return (
      <main
        className='grid min-h-screen place-items-center bg-background p-page'
        id='app-main'
        tabIndex={-1}
      >
        <div className='w-full max-w-content'>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
            <AlertDescription className='flex flex-col gap-cluster text-danger'>
              <p>세션을 확인하지 못했습니다. 다시 시도해 주세요.</p>
              {session.requestId ? (
                <p className='text-caption'>요청 ID: {session.requestId}</p>
              ) : null}
              <Button
                className='mt-cluster w-auto'
                onClick={() => {
                  void restoreSession();
                }}
                type='button'
                variant='outline'
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </main>
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
