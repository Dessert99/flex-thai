/** 콘텐츠 제작 query·upload·preview·create mutation을 console View에 연결한다 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  contentProductionJobsQueryOptions,
  contentProductionPresetsQueryOptions,
  createContentProductionJob,
  previewContentProductionPrompt,
  uploadContentProductionInput,
} from '@/features/run-content-production';
import { ContentProductionConsolePageView } from './ContentProductionConsolePageView';

/** mutation 성공 뒤 job 목록만 무효화하고 preview는 화면 가까이에 둔다 */
export function ContentProductionConsolePageContainer() {
  const queryClient = useQueryClient();
  const presets = useQuery(contentProductionPresetsQueryOptions());
  const jobs = useQuery(contentProductionJobsQueryOptions());
  const [preview, setPreview] = useState<
    Awaited<ReturnType<typeof previewContentProductionPrompt>> | undefined
  >();
  const previewMutation = useMutation({
    mutationFn: previewContentProductionPrompt,
    onSuccess: setPreview,
  });
  const createMutation = useMutation({
    mutationFn: createContentProductionJob,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['admin', 'content-production', 'jobs'],
      }),
  });
  const presetFor = (presetId: string) =>
    presets.data?.items.find((preset) => preset.id === presetId);
  return (
    <ContentProductionConsolePageView
      {...(jobs.data ? { jobs: jobs.data } : {})}
      jobsError={jobs.isError}
      jobsLoading={jobs.isPending}
      onFile={(file) =>
        uploadContentProductionInput(file, new AbortController().signal)
      }
      onPreview={({ presetId, options, questionPlanIndex }) => {
        const preset = presetFor(presetId);
        if (!preset || preset.purpose === 'VOCABULARY_EXTRACTION') return;
        previewMutation.mutate({
          purpose: preset.purpose,
          presetId,
          options,
          questionPlanIndex,
        });
      }}
      onRetryJobs={() => void jobs.refetch()}
      onRetryPresets={() => void presets.refetch()}
      onSubmit={({ presetId, uploadId, options }) => {
        const preset = presetFor(presetId);
        if (!preset) return;
        if (preset.purpose === 'VOCABULARY_EXTRACTION') {
          createMutation.mutate({
            clientRequestId: crypto.randomUUID(),
            purpose: preset.purpose,
            presetId,
            uploadIds: [uploadId],
            options: {},
          });
          return;
        }
        if (!options) return;
        createMutation.mutate({
          clientRequestId: crypto.randomUUID(),
          purpose: preset.purpose,
          presetId,
          uploadIds: [uploadId],
          options,
        });
      }}
      {...(presets.data ? { presets: presets.data } : {})}
      presetsError={presets.isError}
      presetsLoading={presets.isPending}
      {...(preview ? { preview } : {})}
    />
  );
}
