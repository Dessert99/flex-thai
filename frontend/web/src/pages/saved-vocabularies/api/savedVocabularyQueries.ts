/** 단일 저장 어휘 collection의 첫 페이지 Query를 정의한다 */
import { savedVocabularyListResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 저장 목록 전용 cache key와 계약 검증 요청을 만든다 */
export function savedVocabularyQueryOptions() {
  return queryOptions({
    queryKey: [
      'learner',
      'saved-vocabularies',
      { page: 1, pageSize: 20 },
    ] as const,
    queryFn: () =>
      authenticatedRequest({
        path: '/me/saved-vocabularies?page=1&pageSize=20',
        response: { kind: 'json', schema: savedVocabularyListResponseSchema },
      }),
  });
}
