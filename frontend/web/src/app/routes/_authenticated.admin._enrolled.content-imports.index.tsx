/** 검증된 콘텐츠 가져오기 검색값을 목록 Page에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { ContentImportListPageContainer } from '@/pages/content-import-list';

/** 페이지 변경을 replace navigation으로 URL에 반영한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-imports/',
)({
  component: ContentImportListRoute,
});

function ContentImportListRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ContentImportListPageContainer
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
