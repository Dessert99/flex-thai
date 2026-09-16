/** 단어장 목록 서버 상태를 화면 상태로 변환한다 */
import { useQuery } from '@tanstack/react-query';

import { wordbookListQueryOptions } from '../api/wordbookListQueries';
import { WordbookListPageView } from './WordbookListPageView';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

/** 목록 loading·error·success를 분리해 렌더링한다 */
export function WordbookListPageContainer() {
  const wordbooks = useQuery(wordbookListQueryOptions());
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
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <WordbookListPageView items={wordbooks.data.items} />
    </div>
  );
}
