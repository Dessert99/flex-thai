/** 관리자 어휘 상세 GET과 전체 교체 mutation 계약을 정의한다 */
import {
  adminVocabularyDetailResponseSchema,
  adminVocabularyIdPathSchema,
  adminVocabularyReplaceRequestSchema,
  type AdminVocabularyReplaceRequest,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** 어휘 상세 Query option을 계층형 key 아래에 둔다 */
export function adminVocabularyDetailQueryOptions(vocabularyId: string) {
  return queryOptions({
    queryKey: ['admin', 'vocabularies', 'detail', vocabularyId] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/vocabularies/${vocabularyId}`,
        response: { kind: 'json', schema: adminVocabularyDetailResponseSchema },
        signal,
      }),
  });
}

/** 미사용 DRAFT의 child graph를 공개 payload 전체로 교체한다 */
export function replaceAdminVocabulary(command: {
  payload: AdminVocabularyReplaceRequest;
  vocabularyId: string;
}) {
  const { vocabularyId } = adminVocabularyIdPathSchema.parse({
    vocabularyId: command.vocabularyId,
  });
  return authenticatedRequest({
    body: adminVocabularyReplaceRequestSchema.parse(command.payload),
    method: 'PUT',
    path: `/admin/vocabularies/${vocabularyId}`,
    response: { kind: 'empty' },
  });
}
