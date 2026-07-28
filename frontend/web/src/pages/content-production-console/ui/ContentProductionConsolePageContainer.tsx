/** 콘텐츠 제작 query·upload·preview·create mutation을 console View에 연결한다 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentProductionQuestionOptions } from '@flex-thia/contracts';
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
  const questionOptions = (
    presetId: string,
    additionalInstructionKo: string | null,
  ): ContentProductionQuestionOptions | null => {
    const preset = presetFor(presetId);
    if (!preset || preset.purpose === 'VOCABULARY_EXTRACTION') return null;
    return { ...preset.parameters, additionalInstructionKo };
  };
  return (
    <ContentProductionConsolePageView
      {...(jobs.data ? { jobs: jobs.data } : {})}
      jobsError={jobs.isError}
      jobsLoading={jobs.isPending}
      onFile={(file) =>
        uploadContentProductionInput(file, new AbortController().signal)
      }
      onPreview={({ presetId, additionalInstructionKo, questionPlanIndex }) => {
        const preset = presetFor(presetId);
        if (!preset || preset.purpose === 'VOCABULARY_EXTRACTION') return;
        const options = questionOptions(presetId, additionalInstructionKo);
        if (!options) return;
        previewMutation.mutate({
          purpose: preset.purpose,
          presetId,
          options,
          questionPlanIndex,
        });
      }}
      onRetryJobs={() => void jobs.refetch()}
      onRetryPresets={() => void presets.refetch()}
      onSubmit={({ presetId, uploadId, additionalInstructionKo }) => {
        const preset = presetFor(presetId);
        if (!preset) return;
        const options = questionOptions(presetId, additionalInstructionKo);
        createMutation.mutate(
          preset.purpose === 'VOCABULARY_EXTRACTION'
            ? {
                clientRequestId: crypto.randomUUID(),
                purpose: preset.purpose,
                presetId,
                uploadIds: [uploadId],
                options: {},
              }
            : {
                clientRequestId: crypto.randomUUID(),
                purpose: preset.purpose,
                presetId,
                uploadIds: [uploadId],
                options: options!,
              },
        );
      }}
      {...(presets.data ? { presets: presets.data } : {})}
      presetsError={presets.isError}
      presetsLoading={presets.isPending}
      {...(preview ? { preview } : {})}
    />
  );
}
