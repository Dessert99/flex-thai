import {
  type VocabularyCandidateListQuery,
  type VocabularyCandidateListResponse,
} from '@flex-thia/contracts/content-production/vocabulary-candidates';
export interface VocabularyCandidateManagementPageViewProps {
  data?: VocabularyCandidateListResponse;
  error: boolean;
  loading: boolean;
  onFilterChange: (
    patch: Pick<
      Partial<VocabularyCandidateListQuery>,
      'jobId' | 'reviewStatus'
    >,
  ) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  search: VocabularyCandidateListQuery;
}
