import { type QuestionListSearch } from '@/features/learning/libs/question-list/questionListSearch';
import type { QuestionListResponse } from '@flex-thia/contracts/learning/questions';
export interface QuestionListPageViewProps {
  data: QuestionListResponse | undefined;
  error: boolean;
  loading: boolean;
  onFilterChange: (patch: Partial<QuestionListSearch>) => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  onRetry: () => void;
  search: QuestionListSearch;
}
