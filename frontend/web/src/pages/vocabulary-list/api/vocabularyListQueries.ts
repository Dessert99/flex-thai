/** 검증된 URL 검색값을 어휘 목록 API query로 직렬화한다 */
import { vocabularyListResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import type { VocabularyListSearch } from '../model/vocabularyListSearch';

/** 어휘 검색 cache key와 계약 검증 요청을 만든다 */
export function vocabularyListQueryOptions(search: VocabularyListSearch) {
  return queryOptions({
    queryKey: ['learner', 'vocabularies', 'list', search] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/vocabularies?${new URLSearchParams(
          Object.fromEntries(
            Object.entries(search).map(([key, value]) => [key, String(value)]),
          ),
        )}`,
        response: { kind: 'json', schema: vocabularyListResponseSchema },
      }),
  });
}
