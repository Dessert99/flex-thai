/** 단어장 상세 검색 상태를 strict 응답 query로 변환한다 */
import {
  wordbookItemListResponseSchema,
  wordbookListResponseSchema,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import type { WordbookDetailSearch } from '../model/wordbookDetailSearch';

/** 상세 Page가 cross-slice import 없이 쓰는 단어장 목록 query option */
export function detailWordbookListQueryOptions() {
  return queryOptions({
    queryKey: ['learner', 'wordbooks'] as const,
    queryFn: () =>
      authenticatedRequest({
        path: '/me/wordbooks',
        response: { kind: 'json', schema: wordbookListResponseSchema },
      }),
  });
}

/** 단어장 ID와 URL 검색값을 포함한 상세 query option을 만든다 */
export function wordbookDetailQueryOptions(
  wordbookId: string,
  search: WordbookDetailSearch,
) {
  const parameters = new URLSearchParams({
    page: String(search.page),
    pageSize: String(search.pageSize),
  });
  if (search.query !== undefined) parameters.set('query', search.query);
  if (search.kind !== undefined) parameters.set('kind', search.kind);
  if (search.partOfSpeech !== undefined) {
    parameters.set('partOfSpeech', search.partOfSpeech);
  }
  if (search.difficulty !== undefined) {
    parameters.set('difficulty', String(search.difficulty));
  }
  return queryOptions({
    queryKey: ['learner', 'wordbooks', wordbookId, search] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/me/wordbooks/${wordbookId}/items?${parameters.toString()}`,
        response: { kind: 'json', schema: wordbookItemListResponseSchema },
      }),
  });
}
