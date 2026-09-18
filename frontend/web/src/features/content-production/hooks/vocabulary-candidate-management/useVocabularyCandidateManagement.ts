import { vocabularyCandidatesQueryOptions } from '@/features/content-production/apis/review-vocabulary-candidate/vocabularyCandidateApi';
import type { VocabularyCandidateManagementPageViewProps } from '@/features/content-production/libs/vocabulary-candidate-management/vocabularyCandidateManagementPageTypes';
import { changeVocabularyCandidateFilters } from '@/features/content-production/libs/vocabulary-candidate-management/vocabularyCandidateSearch';
import type { VocabularyCandidateListQuery } from '@flex-thia/contracts/content-production/vocabulary-candidates';
import { useQuery } from '@tanstack/react-query';

interface VocabularyCandidateManagementPageContainerProps {
  search: VocabularyCandidateListQuery;
  onSearchChange: (search: VocabularyCandidateListQuery) => void;
}
export function useVocabularyCandidateManagement({
  search,
  onSearchChange,
}: VocabularyCandidateManagementPageContainerProps): VocabularyCandidateManagementPageViewProps {
  const query = useQuery(vocabularyCandidatesQueryOptions(search));
  return {
    ...(query.data ? { data: query.data } : {}),
    error: query.isError,
    loading: query.isPending,
    onFilterChange: (patch) =>
      onSearchChange(changeVocabularyCandidateFilters(search, patch)),
    onPageChange: (page) => onSearchChange({ ...search, page }),
    onRetry: () => void query.refetch(),
    search: search,
  };
}
