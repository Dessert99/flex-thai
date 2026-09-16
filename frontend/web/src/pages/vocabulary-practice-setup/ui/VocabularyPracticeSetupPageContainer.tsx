/** 단어 연습 설정 화면의 목록·검색 서버 상태를 form에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  PracticeSetupForm,
  startVocabularyPractice,
} from '@/features/start-vocabulary-practice';

import {
  practiceVocabularySearchQueryOptions,
  practiceWordbooksQueryOptions,
} from '../api/vocabularyPracticeSetupQueries';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

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
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>단어장을 불러오고 있습니다.</p>
        </section>
      </div>
    );
  }
  if (wordbooks.isError || wordbooks.data === undefined) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>단어장을 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={() => void wordbooks.refetch()}
              type='button'
              variant='outline'
            >
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  const searchState = getSearchState(query, {
    isError: vocabularies.isError,
    isPending: vocabularies.isPending,
  });
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
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
          searchState={searchState}
          wordbooks={wordbooks.data.items}
        />
      </section>
    </div>
  );
}

function getSearchState(
  query: string,
  state: { isError: boolean; isPending: boolean },
) {
  if (query.trim().length === 0) return 'IDLE' as const;
  if (state.isPending) return 'LOADING' as const;
  return state.isError ? ('ERROR' as const) : ('SUCCESS' as const);
}
