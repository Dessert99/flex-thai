/** 학습자의 원시 풀이 기록 첫 페이지 Query를 정의한다 */
import { questionAttemptListResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 통계 변환 없이 원시 풀이 기록 cache key와 요청을 만든다 */
export function attemptHistoryQueryOptions() {
  return queryOptions({
    queryKey: ['learner', 'attempts', { page: 1, pageSize: 20 }] as const,
    queryFn: () =>
      authenticatedRequest({
        path: '/me/question-attempts?page=1&pageSize=20',
        response: {
          kind: 'json',
          schema: questionAttemptListResponseSchema,
        },
      }),
  });
}
