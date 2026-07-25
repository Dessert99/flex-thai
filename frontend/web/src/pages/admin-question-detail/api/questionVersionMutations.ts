/** 관리자 문제 버전 복제·교체·검증 mutation 계약을 정의한다 */
import {
  adminQuestionIdPathSchema,
  adminQuestionValidationReportSchema,
  adminQuestionVersionIdPathSchema,
  adminQuestionVersionPayloadSchema,
  adminQuestionVersionResponseSchema,
  type AdminQuestionVersionPayload,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 새 DRAFT 복제 결과를 replacement navigation에 필요한 ID로 반환한다 */
export function cloneQuestionVersion(questionId: string) {
  const path = adminQuestionIdPathSchema.parse({ questionId });
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/questions/${path.questionId}/versions`,
    response: { kind: 'json', schema: adminQuestionVersionResponseSchema },
  });
}

/** DRAFT 문제 버전을 strict canonical payload 전체로 교체한다 */
export function replaceQuestionVersion(command: {
  payload: AdminQuestionVersionPayload;
  versionId: string;
}) {
  const path = adminQuestionVersionIdPathSchema.parse({
    versionId: command.versionId,
  });
  return authenticatedRequest({
    body: adminQuestionVersionPayloadSchema.parse(command.payload),
    method: 'PUT',
    path: `/admin/question-versions/${path.versionId}`,
    response: { kind: 'json', schema: adminQuestionVersionResponseSchema },
  });
}

/** 검증 FAILED도 성공 응답 보고서로 유지한다 */
export function validateQuestionVersion(versionId: string) {
  const path = adminQuestionVersionIdPathSchema.parse({ versionId });
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/question-versions/${path.versionId}/validate`,
    response: {
      kind: 'json',
      schema: adminQuestionValidationReportSchema,
    },
  });
}
