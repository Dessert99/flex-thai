/** 단어 연습 세션의 strict 조회 query를 제공한다 */
import { queryOptions } from '@tanstack/react-query';
import { getVocabularyPracticeSession } from '@/features/answer-vocabulary-practice';

/** 세션 ID별 단어 연습 조회 query */
export function vocabularyPracticeSessionQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: [
      'learner',
      'vocabulary-practice',
      'sessions',
      sessionId,
    ] as const,
    queryFn: () => getVocabularyPracticeSession(sessionId),
  });
}
