/** 관리자 개념 목록을 URL 검색값과 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import {
  ConceptManagementPageContainer,
  parseAdminConceptSearch,
} from '@/pages/concept-management';

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
    <ConceptManagementPageContainer
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
