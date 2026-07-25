/** TOTP 미등록 관리자 전용 pathless 접근 경계를 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireAdminEnrollment } from '../routing/guards';

/** 인증 부모 session의 관리자 enrollment 상태를 검증한다 */
export const Route = createFileRoute('/_authenticated/admin/_enrollment')({
  beforeLoad: ({ context }) => {
    requireAdminEnrollment(context.session);
  },
  component: AdminEnrollmentRoute,
});

function AdminEnrollmentRoute() {
  return <Outlet />;
}
