/** TOTP 등록 관리자 전용 pathless 접근 경계와 역할 shell을 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { LogoutButton } from '@/features/logout';
import { AppShell } from '@/shared/ui/app-shell';
import { adminNavigation } from '../routing/adminNavigation';
import { requireAdminPortal } from '../routing/guards';

/** 인증 부모 session의 enrolled 관리자 상태를 검증한다 */
export const Route = createFileRoute('/_authenticated/admin/_enrolled')({
  beforeLoad: ({ context }) => {
    requireAdminPortal(context.session);
  },
  component: AdminPortalRoute,
});

function AdminPortalRoute() {
  const { session } = Route.useRouteContext();
  return (
    <AppShell
      identity={{
        email: session.user.email,
        role: session.user.role,
      }}
      navigation={adminNavigation}
      portalLink={{ href: '/learn', label: '학습자 포털' }}
      profileMenu={<LogoutButton />}
    >
      <Outlet />
    </AppShell>
  );
}
