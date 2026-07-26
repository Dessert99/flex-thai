/** 단어 연습 설정 화면의 단어장과 공용 어휘 검색 query를 제공한다 */
import {
  vocabularyListResponseSchema,
  wordbookListResponseSchema,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 설정 화면의 사용자 단어장 목록 query */
export function practiceWordbooksQueryOptions() {
  return queryOptions({
    queryKey: ['learner', 'wordbooks'] as const,
    queryFn: () =>
      authenticatedRequest({
        path: '/me/wordbooks',
        response: { kind: 'json', schema: wordbookListResponseSchema },
      }),
  });
}

/** 설정 화면의 공용 어휘 검색 query */
export function practiceVocabularySearchQueryOptions(query: string) {
  return queryOptions({
    queryKey: ['learner', 'vocabularies', 'practice', query] as const,
    enabled: query.trim().length > 0,
    queryFn: () =>
      authenticatedRequest({
        path: `/vocabularies?page=1&pageSize=100&query=${encodeURIComponent(query)}`,
        response: { kind: 'json', schema: vocabularyListResponseSchema },
      }),
  });
}
