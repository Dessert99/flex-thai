import { type AdminQuestionSearch } from '@/features/learning/libs/question-management/adminQuestionSearch';
import type { AdminQuestionListResponse } from '@flex-thia/contracts/admin/questions';
export interface QuestionManagementPageViewProps {
  data: AdminQuestionListResponse | undefined;
  error: boolean;
  loading: boolean;
  onFilterChange: (patch: Partial<AdminQuestionSearch>) => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  onRetry: () => void;
  search: AdminQuestionSearch;
}
export type QuestionRecord = AdminQuestionListResponse['items'][number];
