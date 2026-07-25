/** URL 검색값과 관리자 문제 Query를 관리 목록 View에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { adminQuestionListQueryOptions } from '../api/adminQuestionQueries';
import {
  changeAdminQuestionFilters,
  type AdminQuestionSearch,
} from '../model/adminQuestionSearch';
import { QuestionManagementPageView } from './QuestionManagementPageView';

interface QuestionManagementPageContainerProps {
  onSearchChange: (search: AdminQuestionSearch) => void;
  search: AdminQuestionSearch;
}

/** 서버 목록 상태와 URL filter patch의 소유권을 Page에 유지한다 */
export function QuestionManagementPageContainer({
  onSearchChange,
  search,
}: QuestionManagementPageContainerProps) {
  const questions = useQuery(adminQuestionListQueryOptions(search));
  return (
    <QuestionManagementPageView
      data={questions.data}
      error={questions.isError}
      loading={questions.isPending}
      onFilterChange={(patch) =>
        onSearchChange(changeAdminQuestionFilters(search, patch))
      }
      onPageChange={(page) => onSearchChange({ ...search, page })}
      onResetFilters={() =>
        onSearchChange({ page: 1, pageSize: search.pageSize })
      }
      onRetry={() => void questions.refetch()}
      search={search}
    />
  );
}
