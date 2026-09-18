import { startVocabularyPractice } from '@/features/learning/apis/start-vocabulary-practice/startVocabularyPractice';
import {
  practiceVocabularySearchQueryOptions,
  practiceWordbooksQueryOptions,
} from '@/features/learning/apis/vocabulary-practice-setup/vocabularyPracticeSetupQueries';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface VocabularyPracticeSetupPageContainerProps {
  onCreated: (sessionId: string) => void;
}
export function useVocabularyPracticeSetup({
  onCreated,
}: VocabularyPracticeSetupPageContainerProps) {
  const [query, setQuery] = useState('');

  const wordbooks = useQuery(practiceWordbooksQueryOptions());

  const vocabularies = useQuery(practiceVocabularySearchQueryOptions(query));
  return {
    onCreated,
    query,
    setQuery,
    wordbooks,
    vocabularies,
    startVocabularyPractice,
  };
}
