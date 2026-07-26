/** 관리자 오류 신고 command adapter의 method·path·body 계약을 검증한다 */
import { adminContentErrorReportDetailResponseSchema } from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignContentErrorReport,
  changeContentErrorReportStatus,
  unassignContentErrorReport,
} from './contentErrorReportMutations';

const authenticatedRequest = vi.hoisted(() => vi.fn());
const reportId = '00000000-0000-4000-8000-000000000001';
const assigneeUserId = '00000000-0000-4000-8000-000000000002';

vi.mock('@/shared/api', () => ({ authenticatedRequest }));

beforeEach(() => {
  authenticatedRequest.mockReset().mockResolvedValue({});
});

describe('관리자 오류 신고 command API', () => {
  it('상태 변경을 status endpoint에 PUT한다', async () => {
    await changeContentErrorReportStatus(reportId, 'IN_PROGRESS');

    expect(authenticatedRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: `/admin/content-error-reports/${reportId}/status`,
      body: { status: 'IN_PROGRESS' },
      response: {
        kind: 'json',
        schema: adminContentErrorReportDetailResponseSchema,
      },
    });
  });

  it('담당자 배정과 해제를 같은 assignee resource에 전달한다', async () => {
    await assignContentErrorReport(reportId, assigneeUserId);
    await unassignContentErrorReport(reportId);

    expect(authenticatedRequest).toHaveBeenNthCalledWith(1, {
      method: 'PUT',
      path: `/admin/content-error-reports/${reportId}/assignee`,
      body: { assigneeUserId },
      response: {
        kind: 'json',
        schema: adminContentErrorReportDetailResponseSchema,
      },
    });
    expect(authenticatedRequest).toHaveBeenNthCalledWith(2, {
      method: 'DELETE',
      path: `/admin/content-error-reports/${reportId}/assignee`,
      response: {
        kind: 'json',
        schema: adminContentErrorReportDetailResponseSchema,
      },
    });
  });
});
