/** 인증이 필요한 모든 route의 부모 접근 경계를 정의한다 */
import {
  createFileRoute,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { LogoutButton } from '@/features/logout';
import { SidebarLayout } from '../../layouts/SidebarLayout';
import { adminNavigation } from '../../routing/adminNavigation';
import { learnerNavigation } from '../../routing/learnerNavigation';
import { requireAuthenticated } from '../../routing/guards';

/** 하위 loader 전에 인증 snapshot을 검증하고 session context를 제공한다 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => ({
    session: requireAuthenticated(
      context.authSessionStore.getSnapshot(),
      location,
    ),
  }),
  component: AuthenticatedRoute,
});

function AuthenticatedRoute() {
  const { session } = Route.useRouteContext();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  return (
    <SidebarLayout
      currentPath={currentPath}
      identity={{ email: session.user.email, role: session.user.role }}
      navigation={learnerNavigation}
      adminNavigation={session.user.role === 'ADMIN' ? adminNavigation : []}
      profileMenu={<LogoutButton appearance='menu' />}
    >
      <Outlet />
    </SidebarLayout>
  );
}
