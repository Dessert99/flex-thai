/** 관리자 개념 목록 query를 정의한다 */
import {
  adminConceptListResponseSchema,
  conceptVersionResponseSchema,
  createConceptRequestSchema,
  type AdminConceptListQuery,
  type CreateConceptRequest,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 관리자 필터별 cache key와 strict 목록 요청을 만든다 */
export function adminConceptListQueryOptions(query: AdminConceptListQuery) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return queryOptions({
    queryKey: ['admin', 'concepts', 'list', query] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/admin/concepts?${params}`,
        response: { kind: 'json', schema: adminConceptListResponseSchema },
      }),
  });
}

/** 개념과 첫 설명 초안을 strict 계약으로 생성한다 */
export function createConcept(input: CreateConceptRequest) {
  return authenticatedRequest({
    body: createConceptRequestSchema.parse(input),
    method: 'POST',
    path: '/admin/concepts',
    response: { kind: 'json', schema: conceptVersionResponseSchema },
  });
}
