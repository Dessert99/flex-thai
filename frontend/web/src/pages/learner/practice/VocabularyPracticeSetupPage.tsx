import { PracticeSetupForm } from '@/features/learning/components/start-vocabulary-practice/PracticeSetupForm';
import { useVocabularyPracticeSetup } from '@/features/learning/hooks/vocabulary-practice-setup/useVocabularyPracticeSetup';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

function getSearchState(
  query: string,
  state: { isError: boolean; isPending: boolean },
) {
  if (query.trim().length === 0) return 'IDLE' as const;
  if (state.isPending) return 'LOADING' as const;
  return state.isError ? ('ERROR' as const) : ('SUCCESS' as const);
}
export function VocabularyPracticeSetupPage(
  pageInput: Parameters<typeof useVocabularyPracticeSetup>[0],
) {
  const {
    onCreated,
    query,
    setQuery,
    wordbooks,
    vocabularies,
    startVocabularyPractice,
  } = useVocabularyPracticeSetup(pageInput);

  if (wordbooks.isPending) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>단어장을 불러오고 있습니다.</p>
          </section>
        </>
      </Container>
    );
  }

  if (wordbooks.isError || wordbooks.data === undefined) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
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
        </>
      </Container>
    );
  }

  const searchState = getSearchState(query, {
    isError: vocabularies.isError,
    isPending: vocabularies.isPending,
  });

  return (
    <Container className='max-w-content flex-1'>
      <>
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
      </>
    </Container>
  );
}
