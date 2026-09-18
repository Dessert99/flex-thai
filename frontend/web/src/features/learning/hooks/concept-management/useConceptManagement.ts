import {
  adminConceptListQueryOptions,
  createConcept,
} from '@/features/learning/apis/concept-management/adminConceptQueries';
import type { AdminConceptSearch } from '@/features/learning/libs/concept-management/adminConceptSearch';
import type { ConceptManagementPageViewProps } from '@/features/learning/libs/concept-management/conceptManagementPageTypes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const mutationErrorMessage = (error: unknown): string | null => {
  if (!error) return null;
  return error instanceof Error ? error.message : '개념을 만들지 못했습니다.';
};
export function useConceptManagement({
  onSearchChange,
  search,
}: {
  onSearchChange: (search: AdminConceptSearch) => void;
  search: AdminConceptSearch;
}): ConceptManagementPageViewProps {
  const client = useQueryClient();

  const concepts = useQuery(adminConceptListQueryOptions(search));

  const create = useMutation({
    mutationFn: createConcept,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['admin', 'concepts'] }),
  });
  return {
    createMessage: mutationErrorMessage(create.error),
    createPending: create.isPending,
    data: concepts.data,
    error: concepts.isError,
    loading: concepts.isPending,
    onFilterChange: (patch) => onSearchChange({ ...search, ...patch }),
    onCreate: (input) => {
      if (!create.isPending) create.mutate(input);
    },
    onRetry: () => void concepts.refetch(),
    search: search,
  };
}
