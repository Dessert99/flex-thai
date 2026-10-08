import { wordbookDetailQueryOptions } from '@/features/learning/apis/wordbook-detail/wordbookDetailQueries';
import type { WordbookDetailSearch } from '@/features/learning/libs/wordbook-detail/wordbookDetailSearch';
import { useQuery } from '@tanstack/react-query';

interface WordbookDetailPageContainerProps {
  onSearchChange: (search: WordbookDetailSearch) => void;
  search: WordbookDetailSearch;
  wordbookId: string;
}
export function useWordbookDetail({
  onSearchChange,
  search,
  wordbookId,
}: WordbookDetailPageContainerProps) {
  const detail = useQuery(wordbookDetailQueryOptions(wordbookId, search));

  return {
    onSearchChange,
    search,
    detail,
  };
}
