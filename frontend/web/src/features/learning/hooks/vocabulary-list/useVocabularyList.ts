import { vocabularyListQueryOptions } from '@/features/learning/apis/vocabulary-list/vocabularyListQueries';
import type { VocabularyListPageViewProps } from '@/features/learning/libs/vocabulary-list/vocabularyListPageTypes';
import {
  changeVocabularyListFilters,
  changeVocabularyListPage,
  type VocabularyListSearch,
} from '@/features/learning/libs/vocabulary-list/vocabularyListSearch';
import { useQuery } from '@tanstack/react-query';

interface VocabularyListPageContainerProps {
  onSearchChange: (search: VocabularyListSearch) => void;
  search: VocabularyListSearch;
}
export function useVocabularyList({
  onSearchChange,
  search,
}: VocabularyListPageContainerProps): VocabularyListPageViewProps {
  const vocabularies = useQuery(vocabularyListQueryOptions(search));
  return {
    data: vocabularies.data,
    error: vocabularies.isError,
    loading: vocabularies.isPending,
    onFilterChange: (patch) =>
      onSearchChange(changeVocabularyListFilters(search, patch)),
    onPageChange: (page) =>
      onSearchChange(changeVocabularyListPage(search, page)),
    onRetry: () => void vocabularies.refetch(),
    search: search,
  };
}
