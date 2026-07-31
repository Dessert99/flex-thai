/** 클릭할 때마다 새 TTS audio URL을 발급해 재생한다 */
import { useMutation } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { getTtsItemAudio } from '../api/ttsAudioApi';

/** 자동 선발급 없이 사용자 클릭 뒤에만 audio를 렌더링한다 */
export function PlayTtsAudioButton({ itemId }: { itemId: string }) {
  const mutation = useMutation({ mutationFn: () => getTtsItemAudio(itemId) });
  return (
    <div className='grid gap-cluster'>
      <Button
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        type='button'
      >
        음성 재생
      </Button>
      {mutation.data ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          aria-label='TTS 음성'
          autoPlay
          controls
          src={mutation.data.url}
        />
      ) : null}
      {mutation.isError ? (
        <p className='text-danger'>
          {isApiError(mutation.error) &&
          mutation.error.detail.kind === 'problem' &&
          mutation.error.detail.problem.status === 409
            ? '아직 재생할 수 없는 음성입니다'
            : '음성을 불러오지 못했습니다.'}
        </p>
      ) : null}
    </div>
  );
}
