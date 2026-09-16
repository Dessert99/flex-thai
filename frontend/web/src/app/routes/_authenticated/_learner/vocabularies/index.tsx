/** 검증된 어휘 검색값을 목록 Page에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { VocabularyListPageContainer } from '@/pages/vocabulary-list';

/** 검색 변경을 replace navigation으로 URL에 반영한다 */
export const Route = createFileRoute('/_authenticated/_learner/vocabularies/')({
  component: VocabularyListRoute,
});

function VocabularyListRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <VocabularyListPageContainer
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
