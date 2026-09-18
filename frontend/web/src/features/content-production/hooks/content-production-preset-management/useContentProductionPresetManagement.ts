import {
  contentProductionPresetVersionsQueryOptions,
  createContentProductionPreset,
  createContentProductionPresetVersion,
  setContentProductionPresetEnabled,
} from '@/features/content-production/apis/manage-content-production-presets/contentProductionPresetApi';
import type { ContentProductionPresetManagementPageViewProps } from '@/features/content-production/libs/content-production-preset-management/contentProductionPresetManagementPageTypes';
import type { ContentProductionPresetVersion } from '@flex-thia/contracts/content-production/content-production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

export function useContentProductionPresetManagement(): ContentProductionPresetManagementPageViewProps {
  const client = useQueryClient();

  const query = useQuery(contentProductionPresetVersionsQueryOptions());

  const [selected, setSelected] = useState<
    ContentProductionPresetVersion | undefined
  >();

  const [conflict, setConflict] = useState(false);

  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({
        queryKey: ['admin', 'content-production', 'preset-versions'],
      }),
      client.invalidateQueries({
        queryKey: ['admin', 'content-production', 'presets'],
      }),
    ]);

  const mutation = useMutation<unknown, unknown, () => Promise<unknown>>({
    mutationFn: (command) => command(),
    onError: () => setConflict(true),
    onSuccess: () => setConflict(false),
    onSettled: invalidate,
  });
  return {
    conflict: conflict,
    ...(query.data ? { data: query.data } : {}),
    error: query.isError,
    loading: query.isPending,
    onCreate: (input) =>
      mutation.mutate(() => createContentProductionPreset(input)),
    onCreateVersion: (presetId, purpose, parameters) =>
      mutation.mutate(() =>
        createContentProductionPresetVersion(presetId, {
          purpose,
          parameters,
        }),
      ),
    onRetry: () => void query.refetch(),
    onSelect: setSelected,
    onSetEnabled: (preset) =>
      mutation.mutate(() =>
        setContentProductionPresetEnabled(
          preset.id,
          !preset.enabled,
          preset.revision,
        ),
      ),
    pending: mutation.isPending,
    ...(selected ? { selected } : {}),
  };
}
