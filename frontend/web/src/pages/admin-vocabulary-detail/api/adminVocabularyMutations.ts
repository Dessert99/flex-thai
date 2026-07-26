/** 관리자 어휘 상세 GET과 전체 교체 mutation 계약을 정의한다 */
import {
  adminVocabularyDetailResponseSchema,
  adminVocabularyIdPathSchema,
  adminVocabularyReplaceRequestSchema,
  adminVocabularyMergeExecuteRequestSchema,
  adminVocabularyMergePreviewRequestSchema,
  adminVocabularyMergePreviewResponseSchema,
  adminVocabularyMergeResponseSchema,
  adminVocabularyRelationCreateRequestSchema,
  adminVocabularyRelationPathSchema,
  adminVocabularyRelationSchema,
  adminVocabularyRelationUpdateRequestSchema,
  type AdminVocabularyMergeExecuteRequest,
  type AdminVocabularyMergePreviewRequest,
  type AdminVocabularyRelationCreateRequest,
  type AdminVocabularyRelationUpdateRequest,
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

/** 새 RELATED 직접 관계를 PENDING으로 생성한다 */
export function createAdminVocabularyRelation(command: {
  payload: AdminVocabularyRelationCreateRequest;
  vocabularyId: string;
}) {
  const { vocabularyId } = adminVocabularyIdPathSchema.parse(command);
  return authenticatedRequest({
    body: adminVocabularyRelationCreateRequestSchema.parse(command.payload),
    method: 'POST',
    path: `/admin/vocabularies/${vocabularyId}/relations`,
    response: { kind: 'json', schema: adminVocabularyRelationSchema },
  });
}

/** 관계 검토 상태 또는 메타데이터를 변경한다 */
export function updateAdminVocabularyRelation(command: {
  payload: AdminVocabularyRelationUpdateRequest;
  relationId: string;
  vocabularyId: string;
}) {
  const path = adminVocabularyRelationPathSchema.parse(command);
  return authenticatedRequest({
    body: adminVocabularyRelationUpdateRequestSchema.parse(command.payload),
    method: 'PUT',
    path: `/admin/vocabularies/${path.vocabularyId}/relations/${path.relationId}`,
    response: { kind: 'json', schema: adminVocabularyRelationSchema },
  });
}

/** 관계를 경로 어휘 상세에서 삭제한다 */
export function deleteAdminVocabularyRelation(command: {
  relationId: string;
  vocabularyId: string;
}) {
  const path = adminVocabularyRelationPathSchema.parse(command);
  return authenticatedRequest({
    method: 'DELETE',
    path: `/admin/vocabularies/${path.vocabularyId}/relations/${path.relationId}`,
    response: { kind: 'empty' },
  });
}

/** 대표 어휘와 live graph를 비교해 opaque 병합 token을 받는다 */
export function previewAdminVocabularyMerge(command: {
  payload: AdminVocabularyMergePreviewRequest;
  vocabularyId: string;
}) {
  const { vocabularyId } = adminVocabularyIdPathSchema.parse(command);
  return authenticatedRequest({
    body: adminVocabularyMergePreviewRequestSchema.parse(command.payload),
    method: 'POST',
    path: `/admin/vocabularies/${vocabularyId}/merge-preview`,
    response: {
      kind: 'json',
      schema: adminVocabularyMergePreviewResponseSchema,
    },
  });
}

/** preview token과 같은 graph일 때 source를 대표로 병합한다 */
export function mergeAdminVocabulary(command: {
  payload: AdminVocabularyMergeExecuteRequest;
  vocabularyId: string;
}) {
  const { vocabularyId } = adminVocabularyIdPathSchema.parse(command);
  return authenticatedRequest({
    body: adminVocabularyMergeExecuteRequestSchema.parse(command.payload),
    method: 'POST',
    path: `/admin/vocabularies/${vocabularyId}/merge`,
    response: { kind: 'json', schema: adminVocabularyMergeResponseSchema },
  });
}
