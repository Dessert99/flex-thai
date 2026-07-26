/** 관리자 개념 버전·노출 상태 mutation을 정의한다 */
import {
  conceptIdPathSchema,
  conceptValidationReportSchema,
  conceptVersionIdPathSchema,
  conceptVersionResponseSchema,
  replaceConceptVersionRequestSchema,
  type ReplaceConceptVersionRequest,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

export function createNextConceptDraft(conceptId: string) {
  const path = conceptIdPathSchema.parse({ conceptId });
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/concepts/${path.conceptId}/versions`,
    response: { kind: 'json', schema: conceptVersionResponseSchema },
  });
}

export function replaceConceptVersion(
  versionId: string,
  payload: ReplaceConceptVersionRequest,
) {
  const path = conceptVersionIdPathSchema.parse({ versionId });
  return authenticatedRequest({
    body: replaceConceptVersionRequestSchema.parse(payload),
    method: 'PUT',
    path: `/admin/concept-versions/${path.versionId}`,
    response: { kind: 'json', schema: conceptVersionResponseSchema },
  });
}

export function validateConceptVersion(versionId: string) {
  const path = conceptVersionIdPathSchema.parse({ versionId });
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/concept-versions/${path.versionId}/validate`,
    response: { kind: 'json', schema: conceptValidationReportSchema },
  });
}

export function publishConceptVersion(versionId: string) {
  const path = conceptVersionIdPathSchema.parse({ versionId });
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/concept-versions/${path.versionId}/publish`,
    response: { kind: 'empty' },
  });
}

export function changeConceptVisibility(
  conceptId: string,
  action: 'hide' | 'restore',
) {
  const path = conceptIdPathSchema.parse({ conceptId });
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/concepts/${path.conceptId}/${action}`,
    response: { kind: 'empty' },
  });
}
