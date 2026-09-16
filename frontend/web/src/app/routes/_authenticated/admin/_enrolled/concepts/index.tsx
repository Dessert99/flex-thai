/** 관리자 개념 목록을 URL 검색값과 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { ConceptManagementPage } from '@/pages/admin/concepts/ConceptManagementPage';
import { parseAdminConceptSearch } from '@/features/learning/libs/concept-management/adminConceptSearch';

/** 관리자 개념 필터와 pagination을 route가 소유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/concepts/',
)({
  component: ConceptManagementRoute,
  validateSearch: parseAdminConceptSearch,
});

function ConceptManagementRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ConceptManagementPage
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
