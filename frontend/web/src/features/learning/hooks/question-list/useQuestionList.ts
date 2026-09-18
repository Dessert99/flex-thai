import { questionListQueryOptions } from '@/features/learning/apis/question-list/questionListQueries';
import type { QuestionListPageViewProps } from '@/features/learning/libs/question-list/questionListPageTypes';
import {
  applyQuestionFilterPatch,
  type QuestionListSearch,
} from '@/features/learning/libs/question-list/questionListSearch';
import { useQuery } from '@tanstack/react-query';

interface QuestionListPageContainerProps {
  onSearchChange: (search: QuestionListSearch) => void;
  search: QuestionListSearch;
}
export function useQuestionList({
  onSearchChange,
  search,
}: QuestionListPageContainerProps): QuestionListPageViewProps {
  const questions = useQuery(questionListQueryOptions(search));
  return {
    data: questions.data,
    error: questions.isError,
    loading: questions.isPending,
    onFilterChange: (patch) => {
      onSearchChange(applyQuestionFilterPatch(search, patch));
    },
    onPageChange: (page) => {
      onSearchChange(applyQuestionFilterPatch(search, { page }));
    },
    onResetFilters: () => {
      onSearchChange({ page: 1, pageSize: search.pageSize });
    },
    onRetry: () => {
      void questions.refetch();
    },
    search: search,
  };
}
