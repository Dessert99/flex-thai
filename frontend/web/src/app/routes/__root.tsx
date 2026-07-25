/** 모든 file route가 공유하는 root Outlet을 정의한다 */
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { RouterContext } from '../routing/routeContext';

/** typed Router context와 root Outlet을 연결한다 */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootRoute,
});

function RootRoute() {
  return <Outlet />;
}
