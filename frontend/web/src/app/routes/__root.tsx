/** 모든 file route가 공유하는 root Outlet과 복구 경계를 정의한다 */
import { NotFoundPage } from '@/pages/errors/NotFoundPage';
import { toUserMessage } from '@/shared/libs/error/toUserMessage';
import {
  createRootRouteWithContext,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { RouteAnnouncer } from '../routing/RouteAnnouncer';
import type { RouterContext } from '../routing/routeContext';

/** typed Router context와 전역 render/not-found 복구 경계를 연결한다 */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootRoute,
  errorComponent: RootRouteError,
  notFoundComponent: RootNotFound,
});

function RootRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <>
      <RouteAnnouncer
        mainId='app-main'
        title={getRouteTitle(pathname)}
      />
      <Outlet />
    </>
  );
}

/** TanStack Router가 전달하는 예상하지 못한 오류 복구 입력 */
export interface RootRouteErrorProps {
  error: unknown;
  reset: () => void;
}

/** 취소는 숨기고 render 실패에는 안전한 문구와 boundary reset을 제공한다 */
export function RootRouteError({ error, reset }: RootRouteErrorProps) {
  const userMessage = toUserMessage(error);
  if (userMessage === null) {
    return null;
  }

  return (
    <main className='grid min-h-screen place-items-center bg-background p-page'>
      <div className='w-full max-w-content'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>{userMessage.message}</p>
            {userMessage.requestId ? (
              <p className='text-caption'>요청 ID: {userMessage.requestId}</p>
            ) : null}
            <Button
              className='mt-cluster w-auto'
              onClick={reset}
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

function RootNotFound() {
  const navigate = useNavigate();
  return (
    <NotFoundPage
      onNavigateHome={() => void navigate({ replace: true, to: '/' })}
    />
  );
}

const routeTitles = [
  [/^\/$/, '홈'],
  [/^\/login\/challenge\/?$/, '이메일 인증 코드'],
  [/^\/login\/confirm\/?$/, '이메일 링크 확인'],
  [/^\/login\/mfa\/?$/, '로그인 추가 인증'],
  [/^\/login\/?$/, '로그인'],
  [/^\/learn\/?$/, '학습 홈'],
  [/^\/wordbooks\/[^/]+\/?$/, '단어장 상세'],
  [/^\/wordbooks\/?$/, '내 단어장'],
  [/^\/vocabularies\/[^/]+\/?$/, '어휘 상세'],
  [/^\/vocabularies\/?$/, '어휘 목록'],
  [/^\/forbidden\/?$/, '접근 권한 없음'],
] as const;

/** 현재 pathname을 screen reader announcement용 제목으로 변환한다 */
export function getRouteTitle(pathname: string): string {
  for (const [pattern, title] of routeTitles) {
    if (pattern.test(pathname)) {
      return title;
    }
  }

  return '페이지를 찾을 수 없음';
}
