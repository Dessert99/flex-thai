/** strict shared schema로 TTS preset 최초·새 version form을 관리한다 */
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createTtsVoicePresetRequestSchema,
  createTtsVoicePresetVersionRequestSchema,
  type CreateTtsVoicePresetRequest,
  type CreateTtsVoicePresetVersionRequest,
  type TtsVoicePresetListResponse,
} from '@flex-thia/contracts';
import { useEffect } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

type Preset = TtsVoicePresetListResponse['items'][number];

/** 최초 preset 설정을 검증해 새 immutable row를 만든다 */
export function CreateTtsPresetForm({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (body: CreateTtsVoicePresetRequest) => Promise<void>;
}) {
  const form = useForm<CreateTtsVoicePresetRequest>({
    defaultValues: {
      name: '',
      provider: 'local',
      model: '',
      voice: '',
      locale: 'th-TH',
      audioFormat: 'audio/wav',
      generationRevision: '',
      enabled: true,
    },
    resolver: zodResolver(createTtsVoicePresetRequestSchema),
  });
  const submit = form.handleSubmit(async (body) => {
    await onCreate(body);
    form.reset();
  });
  return (
    <form
      className='grid gap-cluster rounded-panel border border-default bg-surface p-page md:grid-cols-4'
      onSubmit={(event) => void submit(event)}
    >
      <h2 className='text-title md:col-span-4'>새 preset</h2>
      <TextField
        error={form.formState.errors.name?.message}
        label='이름'
        registration={form.register('name')}
      />
      <TextField
        error={form.formState.errors.provider?.message}
        label='provider'
        registration={form.register('provider')}
      />
      <TextField
        error={form.formState.errors.model?.message}
        label='model'
        registration={form.register('model')}
      />
      <TextField
        error={form.formState.errors.voice?.message}
        label='voice'
        registration={form.register('voice')}
      />
      <TextField
        error={form.formState.errors.generationRevision?.message}
        label='generation revision'
        registration={form.register('generationRevision')}
      />
      <ReadOnlyConfig />
      <label className='flex items-center gap-cluster text-body'>
        <input
          type='checkbox'
          {...form.register('enabled')}
        />
        enabled
      </label>
      <Button
        disabled={disabled}
        type='submit'
      >
        preset 생성
      </Button>
    </form>
  );
}

/** source 이름은 유지하고 새 generation revision 설정을 제출한다 */
export function CreateTtsPresetVersionForm({
  disabled,
  onCancel,
  onCreateVersion,
  preset,
}: {
  disabled: boolean;
  onCancel: () => void;
  onCreateVersion: (
    presetId: string,
    body: CreateTtsVoicePresetVersionRequest,
  ) => Promise<void>;
  preset: Preset;
}) {
  const form = useForm<CreateTtsVoicePresetVersionRequest>({
    defaultValues: {
      expectedUpdatedAt: preset.updatedAt,
      provider: preset.provider,
      model: preset.model,
      voice: preset.voice,
      locale: preset.locale,
      audioFormat: preset.audioFormat,
      generationRevision: '',
      enabled: preset.enabled,
    },
    resolver: zodResolver(createTtsVoicePresetVersionRequestSchema),
  });
  useEffect(() => {
    form.setValue('expectedUpdatedAt', preset.updatedAt);
  }, [form, preset.updatedAt]);
  const submit = form.handleSubmit(async (body) => {
    const created = await onCreateVersion(preset.id, body).then(
      () => true,
      () => false,
    );
    if (created) onCancel();
  });
  return (
    <form
      className='grid gap-cluster rounded-panel border border-default bg-surface p-page md:grid-cols-4'
      onSubmit={(event) => void submit(event)}
    >
      <h2 className='text-title md:col-span-4'>{preset.name} 새 버전</h2>
      <input
        type='hidden'
        {...form.register('expectedUpdatedAt')}
      />
      <TextField
        error={form.formState.errors.provider?.message}
        label='provider'
        registration={form.register('provider')}
      />
      <TextField
        error={form.formState.errors.model?.message}
        label='model'
        registration={form.register('model')}
      />
      <TextField
        error={form.formState.errors.voice?.message}
        label='voice'
        registration={form.register('voice')}
      />
      <TextField
        error={form.formState.errors.generationRevision?.message}
        label='새 generation revision'
        registration={form.register('generationRevision')}
      />
      <ReadOnlyConfig />
      <label className='flex items-center gap-cluster text-body'>
        <input
          type='checkbox'
          {...form.register('enabled')}
        />
        enabled
      </label>
      <div className='flex gap-cluster'>
        <Button
          disabled={disabled}
          type='submit'
        >
          새 버전 생성
        </Button>
        <Button
          onClick={onCancel}
          type='button'
          variant='outline'
        >
          취소
        </Button>
      </div>
    </form>
  );
}

function TextField({
  error,
  label,
  registration,
}: {
  error: string | undefined;
  label: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className='grid gap-cluster'>
      <Label>{label}</Label>
      <Input
        aria-invalid={Boolean(error)}
        aria-label={label}
        {...registration}
      />
      {error ? <p className='text-caption text-danger'>{error}</p> : null}
    </div>
  );
}

function ReadOnlyConfig() {
  return (
    <>
      <div className='grid gap-cluster'>
        <Label>locale</Label>
        <Input
          readOnly
          value='th-TH'
        />
      </div>
      <div className='grid gap-cluster'>
        <Label>audio format</Label>
        <Input
          readOnly
          value='audio/wav'
        />
      </div>
    </>
  );
}
