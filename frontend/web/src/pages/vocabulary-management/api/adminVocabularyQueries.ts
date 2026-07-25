/** 관리자 어휘 목록 Query key와 계약 직렬화를 정의한다 */
import { adminVocabularyListResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import type { AdminVocabularySearch } from '../model/adminVocabularySearch';

/** 검색값과 취소 signal을 관리자 어휘 GET에 연결한다 */
export function adminVocabularyListQueryOptions(search: AdminVocabularySearch) {
  const query = new URLSearchParams();
  (['query', 'kind', 'status', 'page', 'pageSize'] as const).forEach((key) => {
    const value = search[key];
    if (value !== undefined) query.set(key, String(value));
  });
  return queryOptions({
    queryKey: ['admin', 'vocabularies', 'list', search] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/vocabularies?${query}`,
        response: { kind: 'json', schema: adminVocabularyListResponseSchema },
        signal,
      }),
  });
}
