import { learnerHomeQueryOptions } from '@/features/learning/apis/learner-home/learnerHomeQueries';
import type { LearnerHomePageViewProps } from '@/features/learning/libs/learner-home/learnerHomePageTypes';
import { useQuery } from '@tanstack/react-query';

export function useLearnerHome(): LearnerHomePageViewProps {
  const recommendation = useQuery(learnerHomeQueryOptions());
  return {
    error: recommendation.isError,
    onRetry: () => {
      void recommendation.refetch();
    },
    recommendation: recommendation.data ?? null,
    waiting: recommendation.isPending,
  };
}
