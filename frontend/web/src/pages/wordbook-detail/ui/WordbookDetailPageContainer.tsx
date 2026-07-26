/** 단어장 상세 query와 page-local selection을 조정한다 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { WordbookItemActions } from '@/features/manage-wordbook-items';
import {
  detailWordbookListQueryOptions,
  wordbookDetailQueryOptions,
} from '../api/wordbookDetailQueries';
import type { WordbookDetailSearch } from '../model/wordbookDetailSearch';
import { WordbookDetailPageView } from './WordbookDetailPageView';

interface WordbookDetailPageContainerProps {
  onSearchChange: (search: WordbookDetailSearch) => void;
  search: WordbookDetailSearch;
  wordbookId: string;
}

/** URL 검색은 Router에 위임하고 선택은 현재 화면 수명에만 유지한다 */
export function WordbookDetailPageContainer({
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

  return (
    <div className='grid gap-section'>
      <WordbookDetailPageView
        data={detail.data}
        error={detail.isError}
        loading={detail.isPending}
        onRetry={() => void detail.refetch()}
        onSearchChange={onSearchChange}
        onSelectionChange={toggleSelection}
        onSelectPage={() =>
          setSelectedIds(
            new Set(detail.data?.items.map(({ id }) => id) ?? []),
          )
        }
        search={search}
        selectedIds={selectedIds}
      />
      <WordbookItemActions
        onConfirmed={() => setSelectedIds(new Set())}
        selectedIds={[...selectedIds]}
        sourceWordbookId={wordbookId}
        wordbooks={
          wordbooks.data?.items.map(({ id, name }) => ({ id, name })) ?? []
        }
      />
    </div>
  );
}
