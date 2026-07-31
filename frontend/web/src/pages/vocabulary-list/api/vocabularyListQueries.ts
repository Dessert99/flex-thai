/** 검증된 URL 검색값을 어휘 목록 API query로 직렬화한다 */
import {
  vocabularyListQuerySchema,
  vocabularyListResponseSchema,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import type { VocabularyListSearch } from '../model/vocabularyListSearch';

/** 어휘 검색 cache key와 계약 검증 요청을 만든다 */
export function vocabularyListQueryOptions(search: VocabularyListSearch) {
  const query = vocabularyListQuerySchema.parse(search);
  const queryString = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, String(value)]],
    ),
  );
  return queryOptions({
    queryKey: ['learner', 'vocabularies', 'list', query] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/vocabularies?${queryString}`,
        response: { kind: 'json', schema: vocabularyListResponseSchema },
        signal,
      }),
  });
}
