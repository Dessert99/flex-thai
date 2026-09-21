import {
  contentProductionJobsQueryOptions,
  contentProductionPresetsQueryOptions,
  createContentProductionJob,
} from '@/features/content-production/apis/run-content-production/contentProductionApi';
import type { ContentProductionConsolePageViewProps } from '@/features/content-production/libs/content-production-console/contentProductionConsolePageTypes';
import { uploadContentProductionInput } from '@/features/content-production/libs/run-content-production/uploadContentProductionInput';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
export function useContentProductionConsole(): ContentProductionConsolePageViewProps {
  const queryClient = useQueryClient();
  const presets = useQuery(contentProductionPresetsQueryOptions());
  const jobs = useQuery(contentProductionJobsQueryOptions());
  const createMutation = useMutation({
    mutationFn: createContentProductionJob,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['admin', 'content-production', 'jobs'],
      }),
  });
  return {
    ...(jobs.data ? { jobs: jobs.data } : {}),
    jobsError: jobs.isError,
    jobsLoading: jobs.isPending,
    ...(presets.data ? { presets: presets.data } : {}),
    presetsError: presets.isError,
    presetsLoading: presets.isPending,
    mutationPending: createMutation.isPending,
    createError: createMutation.isError,
    onFile: (file) =>
      uploadContentProductionInput(file, new AbortController().signal),
    onRetryJobs: () => void jobs.refetch(),
    onRetryPresets: () => void presets.refetch(),
    onSubmit: ({ presetId, uploadId }) => {
      if (
        createMutation.isPending ||
        !presets.data?.items.some((p) => p.id === presetId)
      )
        return;
      createMutation.mutate({
        clientRequestId: crypto.randomUUID(),
        purpose: 'VOCABULARY_EXTRACTION',
        presetId,
        uploadIds: [uploadId],
        options: {},
      });
    },
  };
}
