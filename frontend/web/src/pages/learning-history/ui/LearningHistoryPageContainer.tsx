/** 원시 풀이 기록 Query의 Page 상태를 관리한다 */
import { useQuery } from '@tanstack/react-query';

import { attemptHistoryQueryOptions } from '../api/attemptHistoryQueries';
import { LearningHistoryPageView } from './LearningHistoryPageView';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

/** 실제 시도 기록만 성공 View에 전달한다 */
export function LearningHistoryPageContainer() {
  const attempts = useQuery(attemptHistoryQueryOptions());

  if (attempts.isPending) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>
            학습 기록을 불러오고 있습니다.
          </p>
        </section>
      </div>
    );
  }
  if (attempts.isError || attempts.data === undefined) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>학습 기록을 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={() => {
                void attempts.refetch();
              }}
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
  if (attempts.data.items.length === 0) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
          <h2 className='text-title text-primary'>
            아직 풀이 기록이 없습니다.
          </h2>
        </section>
      </div>
    );
  }
  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <LearningHistoryPageView attempts={attempts.data.items} />
    </div>
  );
}
