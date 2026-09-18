import type { ContentErrorReportSearch } from '@/features/operations/libs/content-error-report-management/contentErrorReportSearch';
import type {
  AdminContentErrorReportDetailResponse,
  AdminContentErrorReportListResponse,
  ContentErrorReportStatus,
} from '@flex-thia/contracts/feedback/content-error-reports';
/** 관리자 오류 신고 화면의 비동기 상태와 command 입력 */
export interface ContentErrorReportManagementPageViewProps {
  reports: AdminContentErrorReportListResponse | undefined;
  detail: AdminContentErrorReportDetailResponse | undefined;
  search: ContentErrorReportSearch;
  loading: boolean;
  detailLoading: boolean;
  error: boolean;
  detailError: boolean;
  mutationError: boolean;
  mutating: boolean;
  onSearchChange: (search: ContentErrorReportSearch) => void;
  onSelect: (reportId: string) => void;
  onStatusChange: (status: ContentErrorReportStatus) => void;
  onAssign: (assigneeUserId: string) => void;
  onUnassign: () => void;
}
