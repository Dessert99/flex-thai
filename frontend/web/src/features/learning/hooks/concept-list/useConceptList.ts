import { conceptListQueryOptions } from '@/features/learning/apis/concept-list/conceptQueries';
import type { ConceptListPageViewProps } from '@/features/learning/libs/concept-list/conceptListPageTypes';
import type { ConceptCategory } from '@flex-thia/contracts/concepts/concepts';
import { useQuery } from '@tanstack/react-query';

interface ConceptListPageContainerProps {
  category: ConceptCategory;
  onCategoryChange: (category: ConceptCategory) => void;
}
export function useConceptList({
  category,
  onCategoryChange,
}: ConceptListPageContainerProps): ConceptListPageViewProps {
  const concepts = useQuery(conceptListQueryOptions(category));
  return {
    category: category,
    data: concepts.data,
    error: concepts.isError,
    loading: concepts.isPending,
    onCategoryChange: onCategoryChange,
    onRetry: () => void concepts.refetch(),
  };
}
