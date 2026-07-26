/** 어휘 상세·관련 문제 Query와 저장 cache 무효화를 조정한다 */
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { vocabularyDetailQueryOptions } from '../api/vocabularyDetailQueries';
import { VocabularyDetailPageView } from './VocabularyDetailPageView';

/** 두 조회가 준비된 상세만 View에 전달한다 */
export function VocabularyDetailPageContainer({
  vocabularyId,
}: {
  vocabularyId: string;
}) {
  const queryClient = useQueryClient();
  const [detail, related] = useQueries({
    queries: vocabularyDetailQueryOptions(vocabularyId),
  });
  if (detail.isPending || related.isPending) {
    return <PageLoading message='어휘 상세를 불러오고 있습니다.' />;
  }
  if (detail.isError || related.isError || detail.data === undefined) {
    return (
      <PageError
        message='어휘 상세를 불러오지 못했습니다.'
        onRetry={() => {
          void detail.refetch();
          void related.refetch();
        }}
      />
    );
  }
  return (
    <VocabularyDetailPageView
      detail={detail.data}
      onWordbookMembershipConfirmed={() => {
        void queryClient.invalidateQueries({
          queryKey: ['learner', 'vocabularies'],
        });
      }}
      relatedQuestions={related.data?.items ?? []}
    />
  );
}
