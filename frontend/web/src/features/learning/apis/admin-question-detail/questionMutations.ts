/** 현재 문제 편집과 공개 상태 요청. */
import { authenticatedRequest } from '@/shared/apis/auth/authenticatedRequest';
import {
  adminQuestionDetailResponseSchema,
  adminQuestionStatusRequestSchema,
  adminQuestionUpdateRequestSchema,
  type AdminQuestionStatusRequest,
  type AdminQuestionUpdateRequest,
} from '@flex-thia/contracts/admin/questions';
export const updateQuestion = (
  questionId: string,
  input: AdminQuestionUpdateRequest,
) =>
  authenticatedRequest({
    path: `/admin/questions/${questionId}`,
    method: 'PUT',
    body: adminQuestionUpdateRequestSchema.parse(input),
    response: { kind: 'json', schema: adminQuestionDetailResponseSchema },
  });
export const changeQuestionStatus = (
  questionId: string,
  input: AdminQuestionStatusRequest,
) =>
  authenticatedRequest({
    path: `/admin/questions/${questionId}/status`,
    method: 'POST',
    body: adminQuestionStatusRequestSchema.parse(input),
    response: { kind: 'empty' },
  });
