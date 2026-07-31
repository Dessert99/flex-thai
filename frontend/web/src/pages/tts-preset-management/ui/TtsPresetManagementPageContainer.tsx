/** 관리자 TTS preset page가 catalog server state를 소유한다 */
import type {
  CreateTtsVoicePresetRequest,
  CreateTtsVoicePresetVersionRequest,
  TtsVoicePresetDetailResponse,
  TtsVoicePresetListResponse,
} from '@flex-thia/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  changeTtsPresetEnabled,
  createTtsPreset,
  createTtsPresetVersion,
} from '../api/ttsPresetMutations';
import {
  ttsPresetDetailQueryOptions,
  ttsPresetListQueryOptions,
} from '../api/ttsPresetQueries';
import {
  updateTtsPresetSearch,
  type TtsPresetSearch,
} from '../model/ttsPresetSearch';
import { TtsPresetManagementPageView } from './TtsPresetManagementPageView';

/** route 검색값으로 TTS preset catalog를 조회한다 */
export function TtsPresetManagementPageContainer({
  onSearchChange,
  search,
}: {
  onSearchChange: (search: TtsPresetSearch) => void;
  search: TtsPresetSearch;
}) {
  const queryClient = useQueryClient();
  const [versionSourceId, setVersionSourceId] = useState<string | null>(null);
  const query = useQuery(ttsPresetListQueryOptions(search));
  const versionSourceQuery = useQuery({
    ...ttsPresetDetailQueryOptions(versionSourceId ?? ''),
    enabled: versionSourceId !== null,
  });
  const invalidatePresets = async (presetId?: string) => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'tts', 'presets'],
    });
    if (presetId) {
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'tts', 'presets', 'detail', presetId],
      });
    }
  };
  const createMutation = useMutation({
    mutationFn: createTtsPreset,
    onSuccess: () => invalidatePresets(),
  });
  const versionMutation = useMutation({
    mutationFn: ({
      body,
      presetId,
    }: {
      body: CreateTtsVoicePresetVersionRequest;
      presetId: string;
    }) => createTtsPresetVersion(presetId, body),
    onError: (_error, variables) => invalidatePresets(variables.presetId),
    onSuccess: (_result, variables) => invalidatePresets(variables.presetId),
  });
  const toggleMutation = useMutation({
    mutationFn: ({ enabled, preset }: { enabled: boolean; preset: Preset }) =>
      changeTtsPresetEnabled(preset.id, enabled, {
        expectedUpdatedAt: preset.updatedAt,
      }),
    onError: (_error, variables) => invalidatePresets(variables.preset.id),
    onSuccess: (_result, variables) => invalidatePresets(variables.preset.id),
  });
  const mutationError =
    createMutation.error ?? versionMutation.error ?? toggleMutation.error;
  return (
    <TtsPresetManagementPageView
      data={query.data}
      error={query.error}
      loading={query.isPending}
      mutationError={mutationError}
      mutationPending={
        createMutation.isPending ||
        versionMutation.isPending ||
        toggleMutation.isPending
      }
      onCancelVersion={() => setVersionSourceId(null)}
      onCreate={(body: CreateTtsVoicePresetRequest) =>
        createMutation.mutateAsync(body).then(() => undefined)
      }
      onCreateVersion={(presetId, body) =>
        versionMutation.mutateAsync({ body, presetId }).then(() => undefined)
      }
      onFilterChange={(patch) =>
        onSearchChange(updateTtsPresetSearch(search, patch))
      }
      onPageChange={(page) => onSearchChange({ ...search, page })}
      onRetry={() => void query.refetch()}
      onSelectVersion={(preset) => {
        queryClient.setQueryData<TtsVoicePresetDetailResponse>(
          ttsPresetDetailQueryOptions(preset.id).queryKey,
          preset,
        );
        setVersionSourceId(preset.id);
      }}
      onToggle={(preset) =>
        toggleMutation.mutate({
          enabled: !preset.enabled,
          preset,
        })
      }
      search={search}
      versionSource={versionSourceQuery.data ?? null}
    />
  );
}

type Preset = TtsVoicePresetListResponse['items'][number];
