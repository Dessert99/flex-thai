/** 개념 영역 상태와 TanStack Query를 목록 View에 연결한다 */
import type { ConceptCategory } from '@flex-thia/contracts';
import { useQuery } from '@tanstack/react-query';
import { conceptListQueryOptions } from '../api/conceptQueries';
import { ConceptListPageView } from './ConceptListPageView';

interface ConceptListPageContainerProps {
  category: ConceptCategory;
  onCategoryChange: (category: ConceptCategory) => void;
}

/** URL이 소유한 영역을 개념 목록 query에 연결한다 */
export function ConceptListPageContainer({
  category,
  onCategoryChange,
}: ConceptListPageContainerProps) {
  const concepts = useQuery(conceptListQueryOptions(category));
  return (
    <ConceptListPageView
      category={category}
      data={concepts.data}
      error={concepts.isError}
      loading={concepts.isPending}
      onCategoryChange={onCategoryChange}
      onRetry={() => void concepts.refetch()}
    />
  );
}
