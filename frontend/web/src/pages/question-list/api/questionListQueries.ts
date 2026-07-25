/** 검증된 URL 검색값만 학습자 문제 목록 API query로 직렬화한다 */
import { questionListResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import type { QuestionListSearch } from '../model/questionListSearch';

/** 문제 목록의 계층형 cache key와 계약 검증 요청을 만든다 */
export function questionListQueryOptions(search: QuestionListSearch) {
  return queryOptions({
    queryKey: ['learner', 'questions', 'list', search] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/questions?${serializeQuestionListSearch(search)}`,
        response: { kind: 'json', schema: questionListResponseSchema },
      }),
  });
}

function serializeQuestionListSearch(search: QuestionListSearch): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  return query.toString();
}
