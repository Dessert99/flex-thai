/** 관리자 오류 신고 query adapter의 key·endpoint·응답 계약을 검증한다 */
import {
  adminContentErrorReportDetailResponseSchema,
  adminContentErrorReportListResponseSchema,
} from '@flex-thia/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contentErrorReportDetailQueryOptions,
  contentErrorReportListQueryOptions,
} from './contentErrorReportQueries';

const authenticatedRequest = vi.hoisted(() => vi.fn());

vi.mock('@/shared/api', () => ({ authenticatedRequest }));

beforeEach(() => {
  authenticatedRequest.mockReset().mockResolvedValue({});
});

describe('관리자 오류 신고 query API', () => {
  it('검색 문자열을 목록 query key와 endpoint에 함께 고정한다', async () => {
    const search = '?status=OPEN&page=2&pageSize=20';
    const options = contentErrorReportListQueryOptions(search);

    await options.queryFn?.({} as never);

    expect(options.queryKey).toEqual([
      'admin',
      'content-error-reports',
      search,
    ]);
    expect(authenticatedRequest).toHaveBeenCalledWith({
      path: `/admin/content-error-reports${search}`,
      response: {
        kind: 'json',
        schema: adminContentErrorReportListResponseSchema,
      },
    });
  });

  it('신고 ID를 상세 query key와 endpoint에 함께 고정한다', async () => {
    const reportId = '00000000-0000-4000-8000-000000000001';
    const options = contentErrorReportDetailQueryOptions(reportId);

    await options.queryFn?.({} as never);

    expect(options.queryKey).toEqual([
      'admin',
      'content-error-reports',
      reportId,
    ]);
    expect(authenticatedRequest).toHaveBeenCalledWith({
      path: `/admin/content-error-reports/${reportId}`,
      response: {
        kind: 'json',
        schema: adminContentErrorReportDetailResponseSchema,
      },
    });
  });
});
