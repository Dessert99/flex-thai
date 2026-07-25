/** 모든 file route가 공유하는 root Outlet과 복구 경계를 정의한다 */
import {
  createRootRouteWithContext,
  Outlet,
  useNavigate,
} from '@tanstack/react-router';
import { NotFoundPage } from '@/pages/not-found';
import { toUserMessage } from '@/shared/lib/error';
import { PageError } from '@/shared/ui/page-state';
import type { RouterContext } from '../routing/routeContext';

/** typed Router context와 전역 render/not-found 복구 경계를 연결한다 */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootRoute,
  errorComponent: RootRouteError,
  notFoundComponent: RootNotFound,
});

function RootRoute() {
  return <Outlet />;
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
