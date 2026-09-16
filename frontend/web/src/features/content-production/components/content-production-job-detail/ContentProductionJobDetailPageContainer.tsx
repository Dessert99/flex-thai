/** job 상세 query와 retry mutation을 View에 연결한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  contentProductionJobQueryOptions,
  retryContentProductionJob,
} from '@/features/content-production/apis/run-content-production/contentProductionApi';

import { ContentProductionJobDetailPageView } from './ContentProductionJobDetailPageView';
import { Skeleton } from '@/shared/components/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';

/** jobId 하나의 cache와 목록 cache를 retry 뒤 함께 무효화한다 */
export function ContentProductionJobDetailPageContainer({
  jobId,
}: {
  jobId: string;
}) {
  const client = useQueryClient();
  const job = useQuery(contentProductionJobQueryOptions(jobId));
  const retry = useMutation({
    mutationFn: () => retryContentProductionJob(jobId),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: ['admin', 'content-production', 'jobs'],
        }),
        client.invalidateQueries({
          queryKey: ['admin', 'content-production', 'jobs', jobId],
        }),
      ]),
  });
  if (job.isPending)
    return (
      <>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>작업을 불러오고 있습니다.</p>
        </section>
      </>
    );
  if (job.isError || !job.data) {
    return (
      <>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>작업을 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={() => void job.refetch()}
              type='button'
              variant='outline'
            >
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      </>
    );
  }
  return (
    <>
      <ContentProductionJobDetailPageView
        job={job.data}
        onRetry={() => retry.mutate()}
        retrying={retry.isPending}
      />
    </>
  );
}
