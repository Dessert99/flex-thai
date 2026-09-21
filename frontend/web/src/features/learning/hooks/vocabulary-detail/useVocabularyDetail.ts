import { vocabularyDetailQueryOptions } from '@/features/learning/apis/vocabulary-detail/vocabularyDetailQueries';
import { useQueries, useQueryClient } from '@tanstack/react-query';

export function useVocabularyDetail({
  vocabularyId,
}: {
  vocabularyId: string;
}) {
  const queryClient = useQueryClient();

  const [detail] = useQueries({
    queries: vocabularyDetailQueryOptions(vocabularyId),
  });
  return { queryClient, detail };
}
