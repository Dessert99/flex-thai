import { answerVocabularyPractice } from '@/features/learning/apis/answer-vocabulary-practice/answerVocabularyPractice';
import { vocabularyPracticeSessionQueryOptions } from '@/features/learning/apis/vocabulary-practice-session/vocabularyPracticeSessionQuery';
import { useQuery } from '@tanstack/react-query';

export function useVocabularyPracticeSession({
  onShowResult,
  sessionId,
}: {
  onShowResult: (sessionId: string) => void;
  sessionId: string;
}) {
  const session = useQuery(vocabularyPracticeSessionQueryOptions(sessionId));
  return { onShowResult, sessionId, session, answerVocabularyPractice };
}
