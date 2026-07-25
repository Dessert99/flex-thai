/** 관리자 어휘 목록 route를 prefetch와 URL 검색값에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import {
  adminVocabularyListQueryOptions,
  parseAdminVocabularySearch,
  VocabularyManagementPageContainer,
} from '@/pages/vocabulary-management';

/** 목록 Query option을 route loader와 Page가 공유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/vocabularies/',
)({
  component: VocabularyManagementRoute,
  loaderDeps: ({ search }) => parseAdminVocabularySearch(search),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(adminVocabularyListQueryOptions(deps)),
});

function VocabularyManagementRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <VocabularyManagementPageContainer
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
