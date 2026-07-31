/** 콘텐츠 제작 query·upload·preview·create mutation을 console View에 연결한다 */
import { useRef, useState } from 'react';
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
  const previewRevision = useRef(0);
  const previewMutation = useMutation({
    mutationFn: previewContentProductionPrompt,
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
      mutationPending={previewMutation.isPending || createMutation.isPending}
      previewError={previewMutation.isError}
      createError={createMutation.isError}
      onConfigurationChange={() => {
        previewRevision.current += 1;
        previewMutation.reset();
        setPreview(undefined);
      }}
      onFile={(file) =>
        uploadContentProductionInput(file, new AbortController().signal)
      }
      onPreview={({ presetId, options, questionPlanIndex }) => {
        if (previewMutation.isPending) return;
        const preset = presetFor(presetId);
        if (!preset || preset.purpose === 'VOCABULARY_EXTRACTION') return;
        const revision = previewRevision.current + 1;
        previewRevision.current = revision;
        setPreview(undefined);
        void previewMutation
          .mutateAsync({
            purpose: preset.purpose,
            presetId,
            options,
            questionPlanIndex,
          })
          .then((result) => {
            if (previewRevision.current === revision) setPreview(result);
          })
          .catch(() => undefined);
      }}
      onRetryJobs={() => void jobs.refetch()}
      onRetryPresets={() => void presets.refetch()}
      onSubmit={({ presetId, uploadId, options }) => {
        if (createMutation.isPending) return;
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
