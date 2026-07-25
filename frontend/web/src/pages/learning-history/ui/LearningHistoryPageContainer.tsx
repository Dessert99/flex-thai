/** 원시 풀이 기록 Query의 Page 상태를 관리한다 */
import { useQuery } from '@tanstack/react-query';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import { attemptHistoryQueryOptions } from '../api/attemptHistoryQueries';
import { LearningHistoryPageView } from './LearningHistoryPageView';

/** 실제 시도 기록만 성공 View에 전달한다 */
export function LearningHistoryPageContainer() {
  const attempts = useQuery(attemptHistoryQueryOptions());

  if (attempts.isPending) {
    return <PageLoading message='학습 기록을 불러오고 있습니다.' />;
  }
  if (attempts.isError || attempts.data === undefined) {
    return (
      <PageError
        message='학습 기록을 불러오지 못했습니다.'
        onRetry={() => {
          void attempts.refetch();
        }}
      />
    );
  }
  if (attempts.data.items.length === 0) {
    return <PageEmpty title='아직 풀이 기록이 없습니다.' />;
  }
  return <LearningHistoryPageView attempts={attempts.data.items} />;
}
