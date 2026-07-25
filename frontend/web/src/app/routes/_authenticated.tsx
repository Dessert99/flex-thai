/** 인증이 필요한 모든 route의 부모 접근 경계를 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireAuthenticated } from '../routing/guards';

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
  return <Outlet />;
}
