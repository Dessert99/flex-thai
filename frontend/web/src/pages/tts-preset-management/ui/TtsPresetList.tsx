/** TTS preset page의 loading·error·empty·version 목록 상태를 표현한다 */
import type { TtsVoicePresetListResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import {
  hasTtsPresetFilters,
  type TtsPresetSearch,
} from '../model/ttsPresetSearch';

type Preset = TtsVoicePresetListResponse['items'][number];

/** immutable preset 목록과 enabled·active 행동을 표시한다 */
export function TtsPresetList({
  data,
  error,
  loading,
  mutationPending,
  onRetry,
  onSelectVersion,
  onToggle,
  search,
}: {
  data: TtsVoicePresetListResponse | undefined;
  error: unknown;
  loading: boolean;
  mutationPending: boolean;
  onRetry: () => void;
  onSelectVersion: (preset: Preset) => void;
  onToggle: (preset: Preset) => void;
  search: TtsPresetSearch;
}) {
  if (loading) return <PageLoading message='TTS preset을 불러오고 있습니다.' />;
  if (error !== null || data === undefined) {
    return (
      <PageError
        message='TTS preset을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  }
  if (data.items.length === 0) {
    return (
      <PageEmpty
        description={
          hasTtsPresetFilters(search)
            ? '검색어나 enabled 조건을 변경해 보세요.'
            : '위 양식에서 최초 preset version을 만들 수 있습니다.'
        }
        title={
          hasTtsPresetFilters(search)
            ? '조건에 맞는 TTS preset이 없습니다.'
            : '등록된 TTS preset이 없습니다.'
        }
      />
    );
  }
  return (
    <ul className='grid gap-cluster'>
      {data.items.map((preset) => (
        <PresetRecord
          disabled={mutationPending}
          key={preset.id}
          onSelectVersion={onSelectVersion}
          onToggle={onToggle}
          preset={preset}
        />
      ))}
    </ul>
  );
}

function PresetRecord({
  disabled,
  onSelectVersion,
  onToggle,
  preset,
}: {
  disabled: boolean;
  onSelectVersion: (preset: Preset) => void;
  onToggle: (preset: Preset) => void;
  preset: Preset;
}) {
  return (
    <li className='grid gap-cluster rounded-panel border border-default bg-surface p-page'>
      <h2>
        {preset.name} · {preset.generationRevision}
      </h2>
      <p>
        {preset.provider} / {preset.model} / {preset.voice}
      </p>
      <p className='text-caption text-subtle'>
        {preset.locale} · {preset.audioFormat}
      </p>
      <div className='flex flex-wrap gap-cluster'>
        {preset.enabled ? (
          <Badge>enabled</Badge>
        ) : (
          <Badge variant='outline'>disabled</Badge>
        )}
        {preset.active ? <Badge variant='secondary'>active</Badge> : null}
      </div>
      <div className='flex flex-wrap gap-cluster'>
        <Button
          disabled={disabled}
          onClick={() => onSelectVersion(preset)}
          type='button'
          variant='outline'
        >
          새 버전
        </Button>
        <Button
          disabled={disabled || (preset.active && preset.enabled)}
          onClick={() => onToggle(preset)}
          type='button'
          variant='outline'
        >
          {preset.enabled ? '비활성화' : '활성화'}
        </Button>
      </div>
      {preset.active && preset.enabled ? (
        <p className='text-caption text-danger'>
          active preset은 비활성화할 수 없습니다.
        </p>
      ) : null}
    </li>
  );
}
