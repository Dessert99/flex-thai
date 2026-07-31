/** 문제 버전 단위 TTS 재생성과 job 이동 상태를 표현한다 */
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { isApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { regenerateQuestionVersionTts } from '../api/questionVersionMutations';

interface RegenerateQuestionTtsActionProps {
  onConflict: () => Promise<unknown>;
  onSuccess: () => Promise<unknown>;
  questionId: string;
  versionId: string;
}

/** item retry와 구분된 버전 전체 누락 문장 재생성 action */
export function RegenerateQuestionTtsAction({
  onConflict,
  onSuccess,
  questionId,
  versionId,
}: RegenerateQuestionTtsActionProps) {
  const requestRef = useRef<{ requestId: string; target: string } | null>(null);
  const target = `${questionId}:${versionId}`;
  const mutation = useMutation({
    mutationFn: (requestId: string) =>
      regenerateQuestionVersionTts({ questionId, requestId, versionId }),
    onError: (error) => {
      if (
        isApiError(error) &&
        error.detail.kind === 'problem' &&
        error.detail.problem.status === 409
      ) {
        void onConflict();
      }
    },
    onSuccess: () => {
      requestRef.current = null;
      return onSuccess();
    },
    retry: false,
  });
  const firstJobId = mutation.data?.jobIds[0];

  return (
    <div className='grid gap-cluster'>
      <Button
        disabled={mutation.isPending}
        onClick={() => {
          if (requestRef.current?.target !== target) {
            requestRef.current = {
              requestId: crypto.randomUUID(),
              target,
            };
          }
          mutation.mutate(requestRef.current.requestId);
        }}
        type='button'
        variant='outline'
      >
        {mutation.isPending ? 'TTS 예약 중' : '버전 TTS 재생성'}
      </Button>
      {firstJobId ? (
        <a
          className='text-body text-primary underline'
          href={`/admin/tts/jobs/${firstJobId}`}
        >
          생성된 TTS 작업 보기
        </a>
      ) : null}
      {mutation.isSuccess && mutation.data.jobIds.length === 0 ? (
        <p
          aria-live='polite'
          className='text-caption text-subtle'
        >
          모든 필수 문장이 READY 음성을 재사용합니다.
        </p>
      ) : null}
      {mutation.isError ? (
        <p
          aria-live='polite'
          className='text-caption text-danger'
        >
          {isApiError(mutation.error) &&
          mutation.error.detail.kind === 'problem' &&
          mutation.error.detail.problem.status === 409
            ? '다른 TTS 작업이 진행 중입니다. 준비 상태를 새로고침했습니다.'
            : '버전 TTS를 예약하지 못했습니다.'}
        </p>
      ) : null}
    </div>
  );
}
