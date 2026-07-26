/** 관리자 오류 신고 상태와 담당자 mutation을 정의한다 */
import { adminContentErrorReportDetailResponseSchema } from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

const response = {
  kind: 'json' as const,
  schema: adminContentErrorReportDetailResponseSchema,
};

/** 오류 신고 상태를 변경한다 */
export const changeContentErrorReportStatus = (
  reportId: string,
  status: string,
) =>
  authenticatedRequest({
    method: 'PUT',
    path: `/admin/content-error-reports/${reportId}/status`,
    body: { status },
    response,
  });

/** 오류 신고 담당자를 배정한다 */
export const assignContentErrorReport = (
  reportId: string,
  assigneeUserId: string,
) =>
  authenticatedRequest({
    method: 'PUT',
    path: `/admin/content-error-reports/${reportId}/assignee`,
    body: { assigneeUserId },
    response,
  });

/** 오류 신고 담당자를 해제한다 */
export const unassignContentErrorReport = (reportId: string) =>
  authenticatedRequest({
    method: 'DELETE',
    path: `/admin/content-error-reports/${reportId}/assignee`,
    response,
  });
