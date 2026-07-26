/** 단어 연습 세션을 strict 응답 계약으로 조회한다 */
import {
  vocabularyPracticeSessionResponseSchema,
  type VocabularyPracticeSessionResponse,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 한 단어 연습 세션의 현재 진행 상태를 조회한다 */
export function getVocabularyPracticeSession(
  sessionId: string,
): Promise<VocabularyPracticeSessionResponse> {
  return authenticatedRequest({
    path: `/me/vocabulary-practice/sessions/${sessionId}`,
    response: {
      kind: 'json',
      schema: vocabularyPracticeSessionResponseSchema,
    },
  });
}
