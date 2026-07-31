/** 관리자 TTS 작업 page가 목록 server state를 소유한다 */
import { useQuery } from '@tanstack/react-query';
import { ttsJobListQueryOptions } from '../api/ttsOperationsQueries';
import {
  updateTtsOperationsSearch,
  type TtsOperationsSearch,
} from '../model/ttsOperationsSearch';
import { TtsOperationsPageView } from './TtsOperationsPageView';

/** route가 정규화한 검색값으로 TTS 작업 page를 조회한다 */
export function TtsOperationsPageContainer({
  onSearchChange,
  search,
}: {
  onSearchChange: (search: TtsOperationsSearch) => void;
  search: TtsOperationsSearch;
}) {
  const query = useQuery(ttsJobListQueryOptions(search));
  return (
    <TtsOperationsPageView
      data={query.data}
      error={query.error}
      loading={query.isPending}
      onFilterChange={(patch) =>
        onSearchChange(updateTtsOperationsSearch(search, patch))
      }
      onPageChange={(page) => onSearchChange({ ...search, page })}
      onResetFilters={() =>
        onSearchChange({ page: 1, pageSize: search.pageSize })
      }
      onRetry={() => void query.refetch()}
      search={search}
    />
  );
}
