/** 게시 개념 상세 query를 정의한다 */
import { conceptDetailResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 개념 ID별 strict 상세 요청을 만든다 */
export function conceptDetailQueryOptions(conceptId: string) {
  return queryOptions({
    queryKey: ['learner', 'concepts', 'detail', conceptId] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/concepts/${conceptId}`,
        response: { kind: 'json', schema: conceptDetailResponseSchema },
      }),
  });
}
