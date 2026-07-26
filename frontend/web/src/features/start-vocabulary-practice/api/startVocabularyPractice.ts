/** 단어 연습 세션 생성 요청을 strict 응답으로 보낸다 */
import {
  vocabularyPracticeSessionResponseSchema,
  type CreateVocabularyPracticeRequest,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 설정을 materialized 단어 연습 세션으로 생성한다 */
export async function startVocabularyPractice(
  request: CreateVocabularyPracticeRequest,
): Promise<string> {
  const session = await authenticatedRequest({
    method: 'POST',
    path: '/me/vocabulary-practice/sessions',
    body: request,
    response: {
      kind: 'json',
      schema: vocabularyPracticeSessionResponseSchema,
    },
  });
  return session.id;
}
