/** TTS preset version과 enabled·active 상태를 독립적으로 표현한다 */
import type { TtsVoicePresetListResponse } from '@flex-thia/contracts';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';

interface Props {
  data: TtsVoicePresetListResponse | undefined;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
}

/** immutable config와 active disable guard를 관리자에게 명시한다 */
export function TtsPresetManagementPageView({
  data,
  error,
  loading,
  onRetry,
}: Props) {
  if (loading) return <PageLoading message='TTS preset을 불러오고 있습니다.' />;
  if (error !== null || data === undefined)
    return (
      <PageError
        message='TTS preset을 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  if (data.items.length === 0)
    return <PageEmpty title='등록된 TTS preset이 없습니다.' />;
  return (
    <section className='grid gap-section'>
      <h1 className='text-title'>TTS preset 관리</h1>
      <ul className='grid gap-cluster'>
        {data.items.map((preset) => (
          <li
            className='grid gap-cluster'
            key={preset.id}
          >
            <h2>
              {preset.name} · {preset.generationRevision}
            </h2>
            <p>
              {preset.provider} / {preset.model} / {preset.voice}
            </p>
            <div>
              {preset.enabled ? (
                <Badge>enabled</Badge>
              ) : (
                <Badge variant='outline'>disabled</Badge>
              )}
              {preset.active ? <Badge variant='secondary'>active</Badge> : null}
            </div>
            <Button
              disabled={preset.active}
              type='button'
              variant='outline'
            >
              비활성화
            </Button>
            {preset.active ? (
              <p>active preset은 비활성화할 수 없습니다.</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
