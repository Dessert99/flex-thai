import type { ContentImportDetailResponse } from '@flex-thia/contracts/admin/content-imports';
export interface ContentImportDetailPageViewProps {
  data: ContentImportDetailResponse | undefined;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
}
