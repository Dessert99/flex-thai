import { wordbookListQueryOptions } from '@/features/learning/apis/wordbook-list/wordbookListQueries';
import { useQuery } from '@tanstack/react-query';

export function useWordbookList() {
  const wordbooks = useQuery(wordbookListQueryOptions());
  return { wordbooks };
}
