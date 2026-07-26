/** 단어 연습 설정 화면의 목록·검색 서버 상태를 form에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  PracticeSetupForm,
  startVocabularyPractice,
} from '@/features/start-vocabulary-practice';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import {
  practiceVocabularySearchQueryOptions,
  practiceWordbooksQueryOptions,
} from '../api/vocabularyPracticeSetupQueries';

interface VocabularyPracticeSetupPageContainerProps {
  onCreated: (sessionId: string) => void;
}

/** 단어장 loading/error와 검색 결과를 단어 연습 설정에 전달한다 */
export function VocabularyPracticeSetupPageContainer({
  onCreated,
}: VocabularyPracticeSetupPageContainerProps) {
  const [query, setQuery] = useState('');
  const wordbooks = useQuery(practiceWordbooksQueryOptions());
  const vocabularies = useQuery(practiceVocabularySearchQueryOptions(query));
  if (wordbooks.isPending) {
    return <PageLoading message='단어장을 불러오고 있습니다.' />;
  }
  if (wordbooks.isError || wordbooks.data === undefined) {
    return (
      <PageError
        message='단어장을 불러오지 못했습니다.'
        onRetry={() => void wordbooks.refetch()}
      />
    );
  }
  return (
    <section
      aria-labelledby='practice-setup-title'
      className='grid gap-section'
    >
      <h1 id='practice-setup-title'>단어 연습</h1>
      <PracticeSetupForm
        onCreated={onCreated}
        onRetrySearch={() => void vocabularies.refetch()}
        onSearch={setQuery}
        onStart={startVocabularyPractice}
        searchResults={vocabularies.data?.items ?? []}
        searchState={
          query.trim().length === 0
            ? 'IDLE'
            : vocabularies.isPending
              ? 'LOADING'
              : vocabularies.isError
                ? 'ERROR'
                : 'SUCCESS'
        }
        wordbooks={wordbooks.data.items}
      />
    </section>
  );
}
