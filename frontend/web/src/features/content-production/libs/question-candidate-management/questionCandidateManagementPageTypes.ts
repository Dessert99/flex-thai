import type {
  QuestionCandidateListItem,
  QuestionCandidateListQuery,
  QuestionCandidateListResponse,
} from '@flex-thia/contracts/content-production/question-production';
export interface QuestionCandidateManagementPageViewProps {
  data?: QuestionCandidateListResponse;
  error: boolean;
  loading: boolean;
  pending: boolean;
  search: QuestionCandidateListQuery;
  selectedIds: string[];
  onAction: (action: 'APPROVE' | 'DISCARD' | 'REGENERATE') => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onSelectionChange: (candidate: QuestionCandidateListItem) => void;
}
export interface CandidateTableProps {
  items: QuestionCandidateListItem[];
  pending: boolean;
  selectedIds: string[];
  onSelectionChange: (candidate: QuestionCandidateListItem) => void;
}
