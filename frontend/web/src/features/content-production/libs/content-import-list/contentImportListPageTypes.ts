import type { ContentImportCommand } from '@/features/content-production/apis/content-import-list/contentImportQueries';
import type { ContentImportListResponse } from '@flex-thia/contracts/admin/content-imports';
export interface ContentImportListPageViewProps {
  data: ContentImportListResponse | undefined;
  importError: unknown;
  importing: boolean;
  importSucceeded: boolean;
  listError: boolean;
  loading: boolean;
  onImport: (command: ContentImportCommand) => void;
  onImportReset: () => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}
