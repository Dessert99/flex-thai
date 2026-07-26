/** URL search와 관리자 개념 목록 query를 View에 연결한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminConceptListQueryOptions,
  createConcept,
} from '../api/adminConceptQueries';
import type { AdminConceptSearch } from '../model/adminConceptSearch';
import { ConceptManagementPageView } from './ConceptManagementPageView';

const mutationErrorMessage = (error: unknown): string | null => {
  if (!error) return null;
  return error instanceof Error ? error.message : '개념을 만들지 못했습니다.';
};

/** 관리자 목록 서버 상태와 필터 변경을 관리한다 */
export function ConceptManagementPageContainer({
  onSearchChange,
  search,
}: {
  onSearchChange: (search: AdminConceptSearch) => void;
  search: AdminConceptSearch;
}) {
  const client = useQueryClient();
  const concepts = useQuery(adminConceptListQueryOptions(search));
  const create = useMutation({
    mutationFn: createConcept,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['admin', 'concepts'] }),
  });
  return (
    <ConceptManagementPageView
      createMessage={mutationErrorMessage(create.error)}
      createPending={create.isPending}
      data={concepts.data}
      error={concepts.isError}
      loading={concepts.isPending}
      onFilterChange={(patch) => onSearchChange({ ...search, ...patch })}
      onCreate={(input) => {
        if (!create.isPending) create.mutate(input);
      }}
      onRetry={() => void concepts.refetch()}
      search={search}
    />
  );
}
