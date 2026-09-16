/** 관리자 문제 검색값과 하위 관리 route 경계를 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { parseAdminQuestionSearch } from '@/pages/question-management';

/** 모든 관리자 문제 하위 route에서 목록 검색 계약을 검증한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/questions',
)({
  component: AdminQuestionRoutes,
  validateSearch: parseAdminQuestionSearch,
});

function AdminQuestionRoutes() {
  return <Outlet />;
}
