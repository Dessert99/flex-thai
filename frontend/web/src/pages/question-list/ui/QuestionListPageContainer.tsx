/** URL 검색값으로 문제 목록 Query와 필터·페이지 변경을 조정한다 */
import { useQuery } from '@tanstack/react-query';
import { questionListQueryOptions } from '../api/questionListQueries';
import {
  changeQuestionListFilters,
  type QuestionListSearch,
} from '../model/questionListSearch';
import { QuestionListPageView } from './QuestionListPageView';

interface QuestionListPageContainerProps {
  onSearchChange: (search: QuestionListSearch) => void;
  search: QuestionListSearch;
}

/** Router가 소유한 검색값만 사용해 문제 탐색 화면을 구성한다 */
export function QuestionListPageContainer({
  onSearchChange,
  search,
}: QuestionListPageContainerProps) {
  const questions = useQuery(questionListQueryOptions(search));

  return (
    <QuestionListPageView
      data={questions.data}
      error={questions.isError}
      loading={questions.isPending}
      onFilterChange={(patch) => {
        onSearchChange(changeQuestionListFilters(search, patch));
      }}
      onPageChange={(page) => {
        onSearchChange({ ...search, page });
      }}
      onResetFilters={() => {
        onSearchChange({ page: 1, pageSize: search.pageSize });
      }}
      onRetry={() => {
        void questions.refetch();
      }}
      search={search}
    />
  );
}
