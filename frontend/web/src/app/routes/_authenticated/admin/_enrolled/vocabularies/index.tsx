/** 관리자 어휘 목록 route를 prefetch와 URL 검색값에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { adminVocabularyListQueryOptions } from '@/features/learning/apis/vocabulary-management/adminVocabularyQueries';
import { parseAdminVocabularySearch } from '@/features/learning/libs/vocabulary-management/adminVocabularySearch';
import { VocabularyManagementPage } from '@/pages/admin/vocabularies/VocabularyManagementPage';

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
    <VocabularyManagementPage
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
