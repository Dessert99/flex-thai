/** 학습자 답안을 공개 계약으로 검증해 제출한다 */
import {
  submitQuestionAttemptRequestSchema,
  submitQuestionAttemptResponseSchema,
  type SubmitQuestionAttemptResponse,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 한 논리 제출의 멱등 ID와 선택 답안을 포함한다 */
export interface SubmitAnswerCommand {
  clientAttemptId: string;
  durationMs: number;
  questionId: string;
  questionVersionId: string;
  selectedOptionId: string;
}

/** mutation 자동 재시도 없이 동일 command를 서버에 제출한다 */
export function submitAnswer(
  command: SubmitAnswerCommand,
): Promise<SubmitQuestionAttemptResponse> {
  const body = submitQuestionAttemptRequestSchema.parse({
    clientAttemptId: command.clientAttemptId,
    durationMs: command.durationMs,
    questionVersionId: command.questionVersionId,
    selectedOptionId: command.selectedOptionId,
  });
  return authenticatedRequest({
    body,
    method: 'POST',
    path: `/questions/${command.questionId}/attempts`,
    response: { kind: 'json', schema: submitQuestionAttemptResponseSchema },
  });
}
