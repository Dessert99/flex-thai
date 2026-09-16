/** 관리자 오류 신고 검색 상태와 관리 Page를 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { ContentErrorReportManagementPage } from '@/pages/admin/operations/ContentErrorReportManagementPage';
import { parseContentErrorReportSearch } from '@/features/operations/libs/content-error-report-management/contentErrorReportSearch';

/** 공개 계약으로 검증한 filter와 pagination을 관리 화면에 전달한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-error-reports',
)({
  component: ContentErrorReportManagementRoute,
  validateSearch: parseContentErrorReportSearch,
});

function ContentErrorReportManagementRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ContentErrorReportManagementPage
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
