/** 콘텐츠 오류 신고 POST 요청을 strict 계약으로 실행한다 */
import {
  createContentErrorReportResponseSchema,
  type CreateContentErrorReportRequest,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 현재 콘텐츠 오류를 접수한다 */
export const submitContentErrorReport = (
  body: CreateContentErrorReportRequest,
) =>
  authenticatedRequest({
    method: 'POST',
    path: '/content-error-reports',
    body,
    response: { kind: 'json', schema: createContentErrorReportResponseSchema },
  });
