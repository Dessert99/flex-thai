/** 어휘 후보 목록 query와 URL page 상태를 View에 연결한다 */
import type { VocabularyCandidateListQuery } from '@flex-thia/contracts';
import { useQuery } from '@tanstack/react-query';
import { vocabularyCandidatesQueryOptions } from '@/features/review-vocabulary-candidate';
import { changeVocabularyCandidateFilters } from '../model/vocabularyCandidateSearch';
import { VocabularyCandidateManagementPageView } from './VocabularyCandidateManagementPageView';

interface VocabularyCandidateManagementPageContainerProps {
  search: VocabularyCandidateListQuery;
  onSearchChange: (search: VocabularyCandidateListQuery) => void;
}

/** 목록 조회와 page 이동을 하나의 strict query 상태로 유지한다 */
export function VocabularyCandidateManagementPageContainer({
  search,
  onSearchChange,
}: VocabularyCandidateManagementPageContainerProps) {
  const query = useQuery(vocabularyCandidatesQueryOptions(search));
  return (
    <VocabularyCandidateManagementPageView
      {...(query.data ? { data: query.data } : {})}
      error={query.isError}
      loading={query.isPending}
      onFilterChange={(patch) =>
        onSearchChange(changeVocabularyCandidateFilters(search, patch))
      }
      onPageChange={(page) => onSearchChange({ ...search, page })}
      onRetry={() => void query.refetch()}
      search={search}
    />
  );
}
