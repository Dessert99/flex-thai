/** 관리자 콘텐츠 가져오기 URL 검색값과 하위 route 경계를 정의한다 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { parseContentImportListSearch } from '@/pages/content-import-list';

/** API 계약 범위 밖의 이력 검색값을 route 진입 전에 거부한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-imports',
)({
  component: ContentImportRoutes,
  validateSearch: parseContentImportListSearch,
});

function ContentImportRoutes() {
  return <Outlet />;
}
