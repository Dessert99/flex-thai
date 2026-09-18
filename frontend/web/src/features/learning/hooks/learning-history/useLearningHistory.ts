import { attemptHistoryQueryOptions } from '@/features/learning/apis/learning-history/attemptHistoryQueries';
import { useQuery } from '@tanstack/react-query';

export function useLearningHistory() {
  const attempts = useQuery(attemptHistoryQueryOptions());
  return { attempts };
}
