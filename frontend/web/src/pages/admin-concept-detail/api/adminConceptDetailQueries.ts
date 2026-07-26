/** 관리자 개념 상세 query를 정의한다 */
import {
  adminConceptDetailResponseSchema,
  conceptIdPathSchema,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 개념 ID별 모든 버전 상세 요청을 만든다 */
export function adminConceptDetailQueryOptions(conceptId: string) {
  const path = conceptIdPathSchema.parse({ conceptId });
  return queryOptions({
    queryKey: ['admin', 'concepts', 'detail', path.conceptId] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/admin/concepts/${path.conceptId}`,
        response: { kind: 'json', schema: adminConceptDetailResponseSchema },
      }),
  });
}
