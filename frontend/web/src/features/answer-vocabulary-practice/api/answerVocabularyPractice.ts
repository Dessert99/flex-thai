/** 단어 연습 답안을 strict 응답 계약으로 제출한다 */
import {
  vocabularyPracticeAnswerResponseSchema,
  type SubmitVocabularyPracticeAnswerRequest,
  type VocabularyPracticeAnswerResponse,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 한 문항 답안을 멱등 ID와 함께 제출한다 */
export function answerVocabularyPractice(
  sessionId: string,
  questionId: string,
  request: SubmitVocabularyPracticeAnswerRequest,
): Promise<VocabularyPracticeAnswerResponse> {
  return authenticatedRequest({
    method: 'POST',
    path: `/me/vocabulary-practice/sessions/${sessionId}/questions/${questionId}/answers`,
    body: request,
    response: {
      kind: 'json',
      schema: vocabularyPracticeAnswerResponseSchema,
    },
  });
}
