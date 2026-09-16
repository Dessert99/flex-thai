/** 관리자 콘텐츠 오류 신고 목록·상세 Query 옵션을 정의한다 */
import {
  adminContentErrorReportDetailResponseSchema,
  adminContentErrorReportListResponseSchema,
} from '@flex-thia/contracts/feedback/content-error-reports';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/apis/auth/authenticatedRequest';

/** 관리자 오류 신고 목록 Query 옵션 */
export const contentErrorReportListQueryOptions = (search: string) =>
  queryOptions({
    queryKey: ['admin', 'content-error-reports', search] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/admin/content-error-reports${search}`,
        response: {
          kind: 'json',
          schema: adminContentErrorReportListResponseSchema,
        },
      }),
  });

/** 관리자 오류 신고 상세 Query 옵션 */
export const contentErrorReportDetailQueryOptions = (reportId: string) =>
  queryOptions({
    queryKey: ['admin', 'content-error-reports', reportId] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/admin/content-error-reports/${reportId}`,
        response: {
          kind: 'json',
          schema: adminContentErrorReportDetailResponseSchema,
        },
      }),
  });
