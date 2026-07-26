/** 개념 ID와 TanStack Query를 상세 View에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';
import { conceptDetailQueryOptions } from '../api/conceptDetailQueries';
import { ConceptDetailPageView } from './ConceptDetailPageView';

/** 게시 개념 상세의 서버 상태를 관리한다 */
export function ConceptDetailPageContainer({
  conceptId,
}: {
  conceptId: string;
}) {
  const concept = useQuery(conceptDetailQueryOptions(conceptId));
  const notFound =
    isApiError(concept.error) &&
    concept.error.detail.kind === 'problem' &&
    concept.error.detail.problem.status === 404;
  return (
    <ConceptDetailPageView
      data={concept.data}
      error={concept.isError}
      loading={concept.isPending}
      notFound={notFound}
      onRetry={() => void concept.refetch()}
    />
  );
}
