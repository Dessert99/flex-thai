import { vocabularyPracticeResultQueryOptions } from '@/features/learning/apis/vocabulary-practice-result/vocabularyPracticeResultQuery';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

export function useVocabularyPracticeResult({
  onContinue,
  sessionId,
}: {
  onContinue: (sessionId: string) => void;
  sessionId: string;
}) {
  const session = useQuery(vocabularyPracticeResultQueryOptions(sessionId));

  useEffect(() => {
    if (session.data?.status === 'ACTIVE') {
      onContinue(session.data.id);
    }
  }, [onContinue, session.data]);
  return { onContinue, session };
}
