/** 학습자 문제 상세의 계약 검증 Query를 정의한다 */
import { questionDetailResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 문제 ID별 정답 비노출 상세 cache key와 요청을 만든다 */
export function questionDetailQueryOptions(questionId: string) {
  return queryOptions({
    queryKey: ['learner', 'questions', 'detail', questionId] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/questions/${questionId}`,
        response: { kind: 'json', schema: questionDetailResponseSchema },
      }),
  });
}
