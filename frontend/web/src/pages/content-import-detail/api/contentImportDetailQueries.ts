/** 관리자 콘텐츠 가져오기 상세의 계약 검증 Query를 정의한다 */
import { contentImportDetailResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 가져오기 UUID별 상세 cache key와 항목 결과 요청을 만든다 */
export function contentImportDetailQueryOptions(importId: string) {
  return queryOptions({
    queryKey: ['admin', 'content-imports', 'detail', importId] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/admin/content-imports/${importId}`,
        response: { kind: 'json', schema: contentImportDetailResponseSchema },
      }),
  });
}
