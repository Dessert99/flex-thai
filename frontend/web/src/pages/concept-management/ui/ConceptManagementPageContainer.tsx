/** URL search와 관리자 개념 목록 query를 View에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { adminConceptListQueryOptions } from '../api/adminConceptQueries';
import type { AdminConceptSearch } from '../model/adminConceptSearch';
import { ConceptManagementPageView } from './ConceptManagementPageView';

/** 관리자 목록 서버 상태와 필터 변경을 관리한다 */
export function ConceptManagementPageContainer({
  onSearchChange,
  search,
}: {
  onSearchChange: (search: AdminConceptSearch) => void;
  search: AdminConceptSearch;
}) {
  const concepts = useQuery(adminConceptListQueryOptions(search));
  return (
    <ConceptManagementPageView
      data={concepts.data}
      error={concepts.isError}
      loading={concepts.isPending}
      onFilterChange={(patch) => onSearchChange({ ...search, ...patch })}
      onRetry={() => void concepts.refetch()}
      search={search}
    />
  );
}
