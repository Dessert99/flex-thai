/** 어휘별 단어장 membership 조회·추가·제거 요청을 제공한다 */
import { vocabularyWordbookMembershipResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 어휘의 현재 사용자 단어장 membership query option을 만든다 */
export function vocabularyWordbookMembershipQueryOptions(
  vocabularyId: string,
) {
  return queryOptions({
    queryKey: ['learner', 'vocabulary', vocabularyId, 'wordbook-memberships'],
    queryFn: () =>
      authenticatedRequest({
        path: `/me/vocabularies/${vocabularyId}/wordbook-memberships`,
        response: {
          kind: 'json',
          schema: vocabularyWordbookMembershipResponseSchema,
        },
      }),
  });
}

/** 현재 게시 어휘를 소유 단어장에 추가한다 */
export function addVocabularyToWordbook(
  wordbookId: string,
  vocabularyId: string,
): Promise<void> {
  return authenticatedRequest({
    method: 'PUT',
    path: `/me/wordbooks/${wordbookId}/items/${vocabularyId}`,
    response: { kind: 'empty' },
  });
}

/** 어휘 상태와 무관하게 소유 단어장 membership을 제거한다 */
export function removeVocabularyFromWordbook(
  wordbookId: string,
  vocabularyId: string,
): Promise<void> {
  return authenticatedRequest({
    method: 'DELETE',
    path: `/me/wordbooks/${wordbookId}/items/${vocabularyId}`,
    response: { kind: 'empty' },
  });
}
