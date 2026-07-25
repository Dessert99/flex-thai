/** 관리자 문제 상세의 계층형 Query key와 취소 가능한 GET을 정의한다 */
import { adminQuestionDetailResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 문제 UUID별 모든 버전과 검증 보고서를 조회한다 */
export function adminQuestionDetailQueryOptions(questionId: string) {
  return queryOptions({
    queryKey: ['admin', 'questions', 'detail', questionId] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/questions/${questionId}`,
        response: {
          kind: 'json',
          schema: adminQuestionDetailResponseSchema,
        },
        signal,
      }),
  });
}
