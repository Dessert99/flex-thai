import { conceptDetailQueryOptions } from '@/features/learning/apis/concept-detail/conceptDetailQueries';
import type { ConceptDetailPageViewProps } from '@/features/learning/libs/concept-detail/conceptDetailPageTypes';
import { isApiError } from '@/shared/apis/ApiError';
import { useQuery } from '@tanstack/react-query';

export function useConceptDetail({
  conceptId,
}: {
  conceptId: string;
}): ConceptDetailPageViewProps {
  const concept = useQuery(conceptDetailQueryOptions(conceptId));

  const notFound =
    isApiError(concept.error) &&
    concept.error.detail.kind === 'problem' &&
    concept.error.detail.problem.status === 404;
  return {
    data: concept.data,
    error: concept.isError,
    loading: concept.isPending,
    notFound: notFound,
    onRetry: () => void concept.refetch(),
  };
}
