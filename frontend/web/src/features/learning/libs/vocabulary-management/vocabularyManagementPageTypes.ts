import type { AdminVocabularySearch } from '@/features/learning/libs/vocabulary-management/adminVocabularySearch';
import type { AdminVocabularyListResponse } from '@flex-thia/contracts/admin/vocabularies';
export interface Props {
  data: AdminVocabularyListResponse | undefined;
  error: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  search: AdminVocabularySearch;
}
