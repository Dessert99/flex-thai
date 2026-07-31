/** Router 검색값으로 어휘 목록 Query를 관리한다 */
import { useQuery } from '@tanstack/react-query';
import { vocabularyListQueryOptions } from '../api/vocabularyListQueries';
import {
  changeVocabularyListFilters,
  changeVocabularyListPage,
  type VocabularyListSearch,
} from '../model/vocabularyListSearch';
import { VocabularyListPageView } from './VocabularyListPageView';

interface VocabularyListPageContainerProps {
  onSearchChange: (search: VocabularyListSearch) => void;
  search: VocabularyListSearch;
}

/** URL 소유 검색값과 서버 상태를 어휘 목록 View에 연결한다 */
export function VocabularyListPageContainer({
  onSearchChange,
  search,
}: VocabularyListPageContainerProps) {
  const vocabularies = useQuery(vocabularyListQueryOptions(search));
  return (
    <VocabularyListPageView
      data={vocabularies.data}
      error={vocabularies.isError}
      loading={vocabularies.isPending}
      onFilterChange={(patch) =>
        onSearchChange(changeVocabularyListFilters(search, patch))
      }
      onPageChange={(page) =>
        onSearchChange(changeVocabularyListPage(search, page))
      }
      onRetry={() => void vocabularies.refetch()}
      search={search}
    />
  );
}
