import { adminVocabularyListQueryOptions } from '@/features/learning/apis/vocabulary-management/adminVocabularyQueries';
import type { AdminVocabularySearch } from '@/features/learning/libs/vocabulary-management/adminVocabularySearch';
import type { Props as VocabularyManagementState } from '@/features/learning/libs/vocabulary-management/vocabularyManagementPageTypes';
import { useQuery } from '@tanstack/react-query';

interface Props {
  onSearchChange: (search: AdminVocabularySearch) => void;
  search: AdminVocabularySearch;
}
export function useVocabularyManagement({
  onSearchChange,
  search,
}: Props): VocabularyManagementState {
  const query = useQuery(adminVocabularyListQueryOptions(search));
  return {
    data: query.data,
    error: query.isError,
    loading: query.isPending,
    onPageChange: (page) => onSearchChange({ ...search, page }),
    onRetry: () => void query.refetch(),
    search: search,
  };
}
