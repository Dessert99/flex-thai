/** 관리자 홈이 사용하는 최근 문제·어휘의 작은 첫 페이지 조회를 정의한다 */
import {
  adminQuestionListResponseSchema,
  adminVocabularyListResponseSchema,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

const recentPage = { page: 1, pageSize: 3 } as const;

/** 관리자 홈의 독립적인 최근 문제·어휘 Query 옵션을 만든다 */
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
  ] as const;
}
