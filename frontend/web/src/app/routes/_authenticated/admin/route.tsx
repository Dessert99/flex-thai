/** 관리자 enrollment·enrolled 영역의 공통 path parent를 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';

/** `/admin` 하위 pathless 접근 경계를 연결한다 */
export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminRoute,
});

function AdminRoute() {
  return <Outlet />;
}
