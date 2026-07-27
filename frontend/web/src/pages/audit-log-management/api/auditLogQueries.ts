/** 감사 기록 화면의 목록·상세 query options를 정의한다 */
import {
  auditLogDetailResponseSchema,
  auditLogListResponseSchema,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import {
  serializeAuditLogSearch,
  type AuditLogSearch,
} from '../model/auditLogSearch';

/** 감사 목록 cache key prefix */
export const auditLogQueryKey = ['admin', 'audit-logs'] as const;

/** URL 필터에 대응하는 감사 목록 query options */
export function auditLogListQueryOptions(search: AuditLogSearch) {
  return queryOptions({
    queryKey: [...auditLogQueryKey, 'list', search],
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/audit-logs${serializeAuditLogSearch(search)}`,
        response: { kind: 'json', schema: auditLogListResponseSchema },
        signal,
      }),
  });
}

/** 선택된 감사 UUID가 있을 때만 상세를 조회한다 */
export function auditLogDetailQueryOptions(auditLogId: string | undefined) {
  return queryOptions({
    enabled: auditLogId !== undefined,
    queryKey: [...auditLogQueryKey, 'detail', auditLogId],
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/audit-logs/${auditLogId}`,
        response: { kind: 'json', schema: auditLogDetailResponseSchema },
        signal,
      }),
  });
}
