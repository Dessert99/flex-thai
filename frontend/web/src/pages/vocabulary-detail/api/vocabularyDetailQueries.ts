/** 어휘 상세와 관련 문제의 독립 Query를 정의한다 */
import {
  vocabularyDetailResponseSchema,
  vocabularyRelatedQuestionsResponseSchema,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 어휘 ID별 상세와 관련 문제 cache 옵션을 만든다 */
export function vocabularyDetailQueryOptions(vocabularyId: string) {
  return [
    queryOptions({
      queryKey: ['learner', 'vocabularies', 'detail', vocabularyId] as const,
      queryFn: () =>
        authenticatedRequest({
          path: `/vocabularies/${vocabularyId}`,
          response: { kind: 'json', schema: vocabularyDetailResponseSchema },
        }),
    }),
    queryOptions({
      queryKey: [
        'learner',
        'vocabularies',
        'related-questions',
        vocabularyId,
      ] as const,
      queryFn: () =>
        authenticatedRequest({
          path: `/vocabularies/${vocabularyId}/questions?page=1&pageSize=10`,
          response: {
            kind: 'json',
            schema: vocabularyRelatedQuestionsResponseSchema,
          },
        }),
    }),
  ] as const;
}
