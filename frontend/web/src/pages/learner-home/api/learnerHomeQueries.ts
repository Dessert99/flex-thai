/** 학습자 홈이 사용하는 단일 추천 조회를 정의한다 */
import { recommendationResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 학습자 홈의 문제·어휘 추천 Query 옵션을 만든다 */
export function learnerHomeQueryOptions() {
  return queryOptions({
    queryKey: ['learner', 'home', 'recommendations'] as const,
    queryFn: () =>
      authenticatedRequest({
        path: '/me/recommendations',
        response: { kind: 'json', schema: recommendationResponseSchema },
      }),
  });
}
