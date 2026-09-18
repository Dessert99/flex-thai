import type {
  ConceptCategory,
  ConceptListResponse,
} from '@flex-thia/contracts/concepts/concepts';
export interface ConceptListPageViewProps {
  category: ConceptCategory;
  data: ConceptListResponse | undefined;
  error: boolean;
  loading: boolean;
  onCategoryChange: (category: ConceptCategory) => void;
  onRetry: () => void;
}
