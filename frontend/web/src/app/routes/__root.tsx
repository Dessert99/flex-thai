/** 모든 file route가 공유하는 root Outlet과 복구 경계를 정의한다 */
import {
  createRootRouteWithContext,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { NotFoundPage } from '@/pages/not-found';
import { toUserMessage } from '@/shared/lib/error';
import { PageError } from '@/shared/ui/page-state';
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
    <main className='grid min-h-screen place-items-center bg-surface p-page'>
      <div className='w-full max-w-content'>
        <PageError
          message={userMessage.message}
          onRetry={reset}
          {...(userMessage.requestId === undefined
            ? {}
            : { requestId: userMessage.requestId })}
        />
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
  [/^\/login\/mfa\/?$/, '로그인 추가 인증'],
  [/^\/login\/?$/, '로그인'],
  [/^\/learn\/?$/, '학습 홈'],
  [/^\/questions\/[^/]+\/?$/, '문제 풀이'],
  [/^\/questions\/?$/, '문제 목록'],
  [/^\/history\/?$/, '학습 기록'],
  [/^\/saved-vocabularies\/?$/, '저장한 어휘'],
  [/^\/vocabularies\/[^/]+\/?$/, '어휘 상세'],
  [/^\/vocabularies\/?$/, '어휘 목록'],
  [/^\/admin\/totp-setup\/?$/, '관리자 TOTP 설정'],
  [/^\/admin\/content-imports\/[^/]+\/?$/, '콘텐츠 가져오기 상세'],
  [/^\/admin\/content-imports\/?$/, '콘텐츠 가져오기'],
  [
    /^\/admin\/questions\/[^/]+\/versions\/[^/]+\/replace\/?$/,
    '문제 버전 교체',
  ],
  [/^\/admin\/questions\/[^/]+\/?$/, '관리자 문제 상세'],
  [/^\/admin\/questions\/?$/, '문제 관리'],
  [/^\/admin\/vocabularies\/[^/]+\/?$/, '관리자 어휘 상세'],
  [/^\/admin\/vocabularies\/?$/, '어휘 관리'],
  [/^\/admin\/?$/, '관리자 홈'],
  [/^\/forbidden\/?$/, '접근 권한 없음'],
] as const;

function getRouteTitle(pathname: string): string {
  for (const [pattern, title] of routeTitles) {
    if (pattern.test(pathname)) {
      return title;
    }
  }

  return '페이지를 찾을 수 없음';
}
