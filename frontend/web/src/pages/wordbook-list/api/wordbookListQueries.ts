/** 학습자 단어장 목록의 서버 상태 query를 정의한다 */
import { wordbookListResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 단어장 목록의 공용 cache key와 strict 응답 요청을 만든다 */
export function wordbookListQueryOptions() {
  return queryOptions({
    queryKey: ['learner', 'wordbooks'] as const,
    queryFn: () =>
      authenticatedRequest({
        path: '/me/wordbooks',
        response: { kind: 'json', schema: wordbookListResponseSchema },
      }),
  });
}
