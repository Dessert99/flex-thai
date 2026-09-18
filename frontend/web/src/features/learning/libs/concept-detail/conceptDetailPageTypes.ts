import type { ConceptDetailResponse } from '@flex-thia/contracts/concepts/concepts';
export interface ConceptDetailPageViewProps {
  data: ConceptDetailResponse | undefined;
  error: boolean;
  loading: boolean;
  notFound: boolean;
  onRetry: () => void;
}
