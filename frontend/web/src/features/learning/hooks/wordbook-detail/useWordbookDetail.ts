import {
  detailWordbookListQueryOptions,
  wordbookDetailQueryOptions,
} from '@/features/learning/apis/wordbook-detail/wordbookDetailQueries';
import type { WordbookDetailSearch } from '@/features/learning/libs/wordbook-detail/wordbookDetailSearch';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

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

  const wordbooks = useQuery(detailWordbookListQueryOptions());

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = (vocabularyId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(vocabularyId)) next.delete(vocabularyId);
      else next.add(vocabularyId);
      return next;
    });
  };
  return {
    onSearchChange,
    search,
    wordbookId,
    detail,
    wordbooks,
    selectedIds,
    setSelectedIds,
    toggleSelection,
  };
}
