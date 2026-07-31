/** 관리자 홈의 최근 콘텐츠와 독립 운영 상태 query를 정의한다 */
import {
  adminHomeOperationsResponseSchema,
  adminQuestionListResponseSchema,
  adminVocabularyListResponseSchema,
  auditLogListResponseSchema,
  usageCostOverviewResponseSchema,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

const recentPage = { page: 1, pageSize: 3 } as const;
const recentAuditPage = { page: 1, pageSize: 5 } as const;

/** 최근 목록과 전체 운영 집계를 독립 재시도하는 Query 옵션을 만든다 */
export function adminHomeQueryOptions() {
  return [
    queryOptions({
      queryKey: ['admin', 'home', 'questions', recentPage] as const,
      queryFn: () =>
        authenticatedRequest({
          path: '/admin/questions?page=1&pageSize=3',
          response: { kind: 'json', schema: adminQuestionListResponseSchema },
        }),
    }),
    queryOptions({
      queryKey: ['admin', 'home', 'vocabularies', recentPage] as const,
      queryFn: () =>
        authenticatedRequest({
          path: '/admin/vocabularies?page=1&pageSize=3',
          response: { kind: 'json', schema: adminVocabularyListResponseSchema },
        }),
    }),
    queryOptions({
      queryKey: ['admin', 'home', 'audit-logs', recentAuditPage] as const,
      queryFn: () =>
        authenticatedRequest({
          path: '/admin/audit-logs?page=1&pageSize=5',
          response: { kind: 'json', schema: auditLogListResponseSchema },
        }),
    }),
    queryOptions({
      queryKey: ['admin', 'home', 'operations'] as const,
      queryFn: () =>
        authenticatedRequest({
          path: '/admin/home',
          response: {
            kind: 'json',
            schema: adminHomeOperationsResponseSchema,
          },
        }),
    }),
    queryOptions({
      queryKey: ['admin', 'home', 'usage-cost'] as const,
      queryFn: () =>
        authenticatedRequest({
          path: '/admin/usage-cost',
          response: {
            kind: 'json',
            schema: usageCostOverviewResponseSchema,
          },
        }),
    }),
  ] as const;
}
