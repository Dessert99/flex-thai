/** 문제·어휘 추천을 한 요청으로 관리해 같은 계산 시점을 보존한다 */
import { useQuery } from '@tanstack/react-query';
import { learnerHomeQueryOptions } from '../api/learnerHomeQueries';
import { LearnerHomePageView } from './LearnerHomePageView';

/** 학습자 홈 추천의 서버 상태를 화면 상태로 조합한다 */
export function LearnerHomePageContainer() {
  const recommendation = useQuery(learnerHomeQueryOptions());

  return (
    <LearnerHomePageView
      error={recommendation.isError}
      onRetry={() => {
        void recommendation.refetch();
      }}
      recommendation={recommendation.data ?? null}
      waiting={recommendation.isPending}
    />
  );
}
