import {
  contentProductionJobQueryOptions,
  retryContentProductionJob,
} from '@/features/content-production/apis/run-content-production/contentProductionApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useContentProductionJobDetail({ jobId }: { jobId: string }) {
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
  return { job, retry };
}
