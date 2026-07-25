/** TOTP 등록 관리자 전용 pathless 접근 경계를 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireAdminPortal } from '../routing/guards';

/** 인증 부모 session의 enrolled 관리자 상태를 검증한다 */
export const Route = createFileRoute('/_authenticated/admin/_enrolled')({
  beforeLoad: ({ context }) => {
    requireAdminPortal(context.session);
  },
  component: AdminPortalRoute,
});

function AdminPortalRoute() {
  return <Outlet />;
}
