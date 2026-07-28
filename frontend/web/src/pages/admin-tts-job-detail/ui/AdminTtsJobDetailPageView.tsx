/** 관리자 TTS job voice snapshot과 항목 운영 상태를 표현한다 */
import type { TtsJobDetailResponse } from '@flex-thia/contracts';
import { PlayTtsAudioButton } from '@/features/play-tts-audio';
import { RetryTtsItemsAction } from '@/features/retry-tts-items';
import { Badge } from '@/shared/ui/badge';
import { PageError, PageLoading } from '@/shared/ui/page-state';

interface Props {
  data: TtsJobDetailResponse | undefined;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
}

/** voice snapshot·실패 원인·retry·audio를 한 job 문맥에서 조립한다 */
export function AdminTtsJobDetailPageView({
  data,
  error,
  loading,
  onRetry,
}: Props) {
  if (loading)
    return <PageLoading message='TTS 작업 상세를 불러오고 있습니다.' />;
  if (error !== null || data === undefined)
    return (
      <PageError
        message='TTS 작업 상세를 불러오지 못했습니다.'
        onRetry={onRetry}
      />
    );
  return (
    <section className='grid gap-section'>
      <h1 className='text-title'>TTS 작업 상세</h1>
      <p>
        {data.voice.provider} / {data.voice.model} / {data.voice.voice}
      </p>
      <RetryTtsItemsAction
        items={data.items}
        jobId={data.id}
      />
      <ul className='grid gap-cluster'>
        {data.items.map((item) => (
          <li key={item.id}>
            <Badge
              variant={item.status === 'FAILED' ? 'destructive' : 'secondary'}
            >
              {item.status}
            </Badge>
            {item.errorCode ? <p>{item.errorCode}</p> : null}
            {item.status === 'SUCCEEDED' ? (
              <PlayTtsAudioButton itemId={item.id} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
