/** TTS preset page의 loading·error·empty·version 목록 상태를 표현한다 */
import type { TtsVoicePresetListResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';

import {
  hasTtsPresetFilters,
  type TtsPresetSearch,
} from '../model/ttsPresetSearch';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

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
  if (loading)
    return (
      <section
        aria-live='polite'
        className='flex min-h-state flex-col justify-center gap-cluster p-page'
        role='status'
      >
        <Skeleton className='h-control w-full max-w-content' />
        <p className='text-body text-subtle'>TTS preset을 불러오고 있습니다.</p>
      </section>
    );
  if (error !== null || data === undefined) {
    return (
      <Alert
        className='rounded-panel border-danger bg-danger-surface'
        variant='destructive'
      >
        <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
        <AlertDescription className='flex flex-col gap-cluster text-danger'>
          <p>TTS preset을 불러오지 못했습니다.</p>
          <Button
            className='mt-cluster w-auto'
            onClick={onRetry}
            type='button'
            variant='outline'
          >
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (data.items.length === 0) {
    return (
      <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
        <h2 className='text-title text-primary'>
          {hasTtsPresetFilters(search)
            ? '조건에 맞는 TTS preset이 없습니다.'
            : '등록된 TTS preset이 없습니다.'}
        </h2>
        <p className='text-body text-subtle'>
          {hasTtsPresetFilters(search)
            ? '검색어나 enabled 조건을 변경해 보세요.'
            : '위 양식에서 최초 preset version을 만들 수 있습니다.'}
        </p>
      </section>
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
