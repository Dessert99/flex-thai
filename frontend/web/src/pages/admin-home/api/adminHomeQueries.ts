/** 관리자 홈의 최근 콘텐츠와 독립 운영 상태 query를 정의한다 */
import {
  adminQuestionListResponseSchema,
  adminVocabularyListResponseSchema,
  auditLogListResponseSchema,
  contentProductionJobListResponseSchema,
  questionCandidateListResponseSchema,
  ttsJobListResponseSchema,
  usageCostOverviewResponseSchema,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

const recentPage = { page: 1, pageSize: 3 } as const;
const recentAuditPage = { page: 1, pageSize: 5 } as const;

/** 관리자 홈 카드마다 별도 재시도할 수 있는 Query 옵션을 만든다 */
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
      queryKey: ['admin', 'home', 'content-production-jobs'] as const,
      queryFn: () =>
        authenticatedRequest({
          path: '/admin/content-production/jobs?limit=20',
          response: {
            kind: 'json',
            schema: contentProductionJobListResponseSchema,
          },
        }),
    }),
    queryOptions({
      queryKey: ['admin', 'home', 'pending-question-candidates'] as const,
      queryFn: () =>
        authenticatedRequest({
          path: '/admin/content-production/question-candidates?reviewStatus=PENDING&page=1&pageSize=1',
          response: {
            kind: 'json',
            schema: questionCandidateListResponseSchema,
          },
        }),
    }),
    queryOptions({
      queryKey: ['admin', 'home', 'tts-jobs'] as const,
      queryFn: () =>
        authenticatedRequest({
          path: '/admin/tts/jobs?page=1&pageSize=20',
          response: { kind: 'json', schema: ttsJobListResponseSchema },
        }),
    }),
    queryOptions({
      queryKey: ['admin', 'home', 'usage-cost'] as const,
      queryFn: () =>
        authenticatedRequest({
          path: '/admin/usage-cost',
          response: { kind: 'json', schema: usageCostOverviewResponseSchema },
        }),
    }),
  ] as const;
}
