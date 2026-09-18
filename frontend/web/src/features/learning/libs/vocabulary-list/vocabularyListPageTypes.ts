import type {
  VocabularyListFilterPatch,
  VocabularyListSearch,
} from '@/features/learning/libs/vocabulary-list/vocabularyListSearch';
import type { VocabularyListResponse } from '@flex-thia/contracts/learning/vocabularies';
export interface VocabularyListPageViewProps {
  data: VocabularyListResponse | undefined;
  error: boolean;
  loading: boolean;
  onFilterChange: (patch: VocabularyListFilterPatch) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  search: VocabularyListSearch;
}
