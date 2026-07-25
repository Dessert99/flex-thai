/** 관리자 어휘 검색값과 목록 Query를 View에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { adminVocabularyListQueryOptions } from '../api/adminVocabularyQueries';
import type { AdminVocabularySearch } from '../model/adminVocabularySearch';
import { VocabularyManagementPageView } from './VocabularyManagementPageView';

interface Props {
  onSearchChange: (search: AdminVocabularySearch) => void;
  search: AdminVocabularySearch;
}

/** URL이 소유한 검색값과 서버 목록 상태를 조립한다 */
export function VocabularyManagementPageContainer({
  onSearchChange,
  search,
}: Props) {
  const query = useQuery(adminVocabularyListQueryOptions(search));
  return (
    <VocabularyManagementPageView
      data={query.data}
      error={query.isError}
      loading={query.isPending}
      onPageChange={(page) => onSearchChange({ ...search, page })}
      onRetry={() => void query.refetch()}
      search={search}
    />
  );
}
