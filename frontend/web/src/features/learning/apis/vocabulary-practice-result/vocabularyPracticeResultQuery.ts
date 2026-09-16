/** 단어 연습 결과 세션 query를 제공한다 */
import { queryOptions } from '@tanstack/react-query';
import { getVocabularyPracticeSession } from '@/features/learning/apis/answer-vocabulary-practice/getVocabularyPracticeSession';

/** 결과 화면의 세션 ID별 조회 query */
export function vocabularyPracticeResultQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: [
      'learner',
      'vocabulary-practice',
      'sessions',
      sessionId,
      'result',
    ] as const,
    queryFn: () => getVocabularyPracticeSession(sessionId),
  });
}
