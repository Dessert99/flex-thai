/** enrolled 관리자 shell의 승인된 `/admin` index route를 등록한다 */
import { createFileRoute } from '@tanstack/react-router';

/** Task 8 Page 연결 전 route generator 충돌을 막는 빈 route shell */
export const Route = createFileRoute('/_authenticated/admin/_enrolled/')({
  component: AdminHomeRoute,
});

function AdminHomeRoute() {
  return null;
}
