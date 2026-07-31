/** job 상세 query와 retry mutation을 View에 연결한다 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  contentProductionJobQueryOptions,
  retryContentProductionJob,
} from '@/features/run-content-production';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { ContentProductionJobDetailPageView } from './ContentProductionJobDetailPageView';

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
  if (job.isPending) return <PageLoading message='작업을 불러오고 있습니다.' />;
  if (job.isError || !job.data) {
    return (
      <PageError
        message='작업을 불러오지 못했습니다.'
        onRetry={() => void job.refetch()}
      />
    );
  }
  return (
    <ContentProductionJobDetailPageView
      job={job.data}
      onRetry={() => retry.mutate()}
      retrying={retry.isPending}
    />
  );
}
