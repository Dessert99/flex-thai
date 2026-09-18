import { adminQuestionListQueryOptions } from '@/features/learning/apis/question-management/adminQuestionQueries';
import {
  changeAdminQuestionFilters,
  type AdminQuestionSearch,
} from '@/features/learning/libs/question-management/adminQuestionSearch';
import type { QuestionManagementPageViewProps } from '@/features/learning/libs/question-management/questionManagementPageTypes';
import { useQuery } from '@tanstack/react-query';

interface QuestionManagementPageContainerProps {
  onSearchChange: (search: AdminQuestionSearch) => void;
  search: AdminQuestionSearch;
}
export function useQuestionManagement({
  onSearchChange,
  search,
}: QuestionManagementPageContainerProps): QuestionManagementPageViewProps {
  const questions = useQuery(adminQuestionListQueryOptions(search));
  return {
    data: questions.data,
    error: questions.isError,
    loading: questions.isPending,
    onFilterChange: (patch) =>
      onSearchChange(changeAdminQuestionFilters(search, patch)),
    onPageChange: (page) => onSearchChange({ ...search, page }),
    onResetFilters: () =>
      onSearchChange({ page: 1, pageSize: search.pageSize }),
    onRetry: () => void questions.refetch(),
    search: search,
  };
}
