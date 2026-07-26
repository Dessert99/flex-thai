/** 관리자 오류 신고 filter를 URL query와 API query로 직렬화한다 */
import type { AdminContentErrorReportListQuery } from '@flex-thia/contracts';
import { adminContentErrorReportListQuerySchema } from '@flex-thia/contracts';

/** 관리 화면이 소유하는 검색 상태 */
export type ContentErrorReportSearch = AdminContentErrorReportListQuery;

/** Router raw search에 공개 계약 기본값과 strict 검증을 적용한다 */
export function parseContentErrorReportSearch(
  raw: Record<string, unknown>,
): ContentErrorReportSearch {
  return adminContentErrorReportListQuerySchema.parse(raw);
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
