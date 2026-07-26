/** 관리자 오류 신고 filter를 URL query와 API query로 직렬화한다 */
import type {
  AdminContentErrorReportListQuery,
  ContentErrorReportCategory,
  ContentErrorReportStatus,
  ContentErrorReportTargetKind,
} from '@flex-thia/contracts';

/** 관리 화면이 소유하는 검색 상태 */
export interface ContentErrorReportSearch {
  status?: ContentErrorReportStatus;
  targetKind?: ContentErrorReportTargetKind;
  category?: ContentErrorReportCategory;
  assigneeUserId?: string;
  page: number;
  pageSize: number;
}

/** 빈 filter를 제외하고 계약 query를 안정적으로 직렬화한다 */
export const serializeContentErrorReportSearch = (
  search: ContentErrorReportSearch,
): string => {
  const query: AdminContentErrorReportListQuery = search;
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.targetKind) params.set('targetKind', query.targetKind);
  if (query.category) params.set('category', query.category);
  if (query.assigneeUserId) params.set('assigneeUserId', query.assigneeUserId);
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  return `?${params.toString()}`;
};
