/** 영역별 게시 개념 목록 query를 정의한다 */
import {
  conceptListResponseSchema,
  type ConceptCategory,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 개념 영역별 cache key와 strict 응답 요청을 만든다 */
export function conceptListQueryOptions(category: ConceptCategory) {
  return queryOptions({
    queryKey: ['learner', 'concepts', 'list', category] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/concepts?category=${category}`,
        response: { kind: 'json', schema: conceptListResponseSchema },
      }),
  });
}
