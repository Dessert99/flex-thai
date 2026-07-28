/** TTS preset version 생성과 enabled·active 상태를 독립적으로 조립한다 */
import type {
  CreateTtsVoicePresetRequest,
  CreateTtsVoicePresetVersionRequest,
  TtsVoicePresetListResponse,
} from '@flex-thia/contracts';
import { useState } from 'react';
import { isApiError } from '@/shared/api';
import type { TtsPresetSearch } from '../model/ttsPresetSearch';
import {
  CreateTtsPresetForm,
  CreateTtsPresetVersionForm,
} from './TtsPresetForms';
import { TtsPresetFilters, TtsPresetPagination } from './TtsPresetFilters';
import { TtsPresetList } from './TtsPresetList';

type Preset = TtsVoicePresetListResponse['items'][number];

interface Props {
  data: TtsVoicePresetListResponse | undefined;
  error: unknown;
  loading: boolean;
  mutationError: unknown;
  mutationPending: boolean;
  onCreate: (body: CreateTtsVoicePresetRequest) => Promise<void>;
  onCreateVersion: (
    presetId: string,
    body: CreateTtsVoicePresetVersionRequest,
  ) => Promise<void>;
  onFilterChange: (patch: Partial<TtsPresetSearch>) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onToggle: (preset: Preset) => void;
  search: TtsPresetSearch;
}

/** immutable 생성 form과 catalog server state를 한 화면에 연결한다 */
export function TtsPresetManagementPageView({
  data,
  error,
  loading,
  mutationError,
  mutationPending,
  onCreate,
  onCreateVersion,
  onFilterChange,
  onPageChange,
  onRetry,
  onToggle,
  search,
}: Props) {
  const [versionSource, setVersionSource] = useState<Preset | null>(null);

  return (
    <section className='grid gap-section'>
      <header className='space-y-cluster'>
        <h1 className='text-title'>TTS preset 관리</h1>
        <p className='text-body text-subtle'>
          기존 설정을 수정하지 않고 새 preset 또는 새 version을 만듭니다.
        </p>
      </header>
      <CreateTtsPresetForm
        disabled={mutationPending}
        onCreate={onCreate}
      />
      {versionSource ? (
        <CreateTtsPresetVersionForm
          disabled={mutationPending}
          key={versionSource.id}
          onCancel={() => setVersionSource(null)}
          onCreateVersion={onCreateVersion}
          preset={versionSource}
        />
      ) : null}
      <TtsPresetFilters
        onChange={onFilterChange}
        search={search}
      />
      {mutationError ? (
        <p className='text-body text-danger'>
          {isConflict(mutationError)
            ? '다른 변경이 먼저 반영되었습니다. 목록을 갱신했으니 다시 확인해 주세요.'
            : 'TTS preset 변경을 저장하지 못했습니다.'}
        </p>
      ) : null}
      <TtsPresetList
        data={data}
        error={error}
        loading={loading}
        mutationPending={mutationPending}
        onRetry={onRetry}
        onSelectVersion={setVersionSource}
        onToggle={onToggle}
        search={search}
      />
      {data && data.items.length > 0 ? (
        <TtsPresetPagination
          onPageChange={onPageChange}
          page={data.page}
        />
      ) : null}
    </section>
  );
}

function isConflict(error: unknown) {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.status === 409
  );
}
