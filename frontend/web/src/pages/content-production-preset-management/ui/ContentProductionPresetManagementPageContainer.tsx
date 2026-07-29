/** preset version query와 create·enable command를 운영 View에 연결한다 */
import { useState } from 'react';
import type { ContentProductionPresetVersion } from '@flex-thia/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  contentProductionPresetVersionsQueryOptions,
  createContentProductionPreset,
  createContentProductionPresetVersion,
  setContentProductionPresetEnabled,
} from '@/features/manage-content-production-presets';
import { ContentProductionPresetManagementPageView } from './ContentProductionPresetManagementPageView';

/** 모든 mutation 뒤 version 목록과 실행 화면의 enabled preset 목록을 갱신한다 */
export function ContentProductionPresetManagementPageContainer() {
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
  return (
    <ContentProductionPresetManagementPageView
      conflict={conflict}
      {...(query.data ? { data: query.data } : {})}
      error={query.isError}
      loading={query.isPending}
      onCreate={(input) =>
        mutation.mutate(() => createContentProductionPreset(input))
      }
      onCreateVersion={(presetId, purpose, parameters) =>
        mutation.mutate(() =>
          createContentProductionPresetVersion(presetId, {
            purpose,
            parameters,
          }),
        )
      }
      onRetry={() => void query.refetch()}
      onSelect={setSelected}
      onSetEnabled={(preset) =>
        mutation.mutate(() =>
          setContentProductionPresetEnabled(
            preset.id,
            !preset.enabled,
            preset.revision,
          ),
        )
      }
      pending={mutation.isPending}
      {...(selected ? { selected } : {})}
    />
  );
}
