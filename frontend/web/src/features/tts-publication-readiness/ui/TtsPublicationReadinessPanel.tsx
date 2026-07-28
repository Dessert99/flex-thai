/** validation과 독립된 TTS 게시 readiness와 blocker를 표시한다 */
import type { TtsPublicationReadinessResponse } from '@flex-thia/contracts';
import { RetryTtsItemsAction } from '@/features/retry-tts-items';

interface TtsPublicationReadinessPanelProps {
  readiness: TtsPublicationReadinessResponse;
}

/** 게시 전 필수 음성 준비 수량과 복구 가능한 실패 작업을 안내한다 */
export function TtsPublicationReadinessPanel({
  readiness,
}: TtsPublicationReadinessPanelProps) {
  return (
    <section
      aria-label='TTS 게시 준비 상태'
      className='grid gap-cluster rounded-panel border border-default bg-surface-muted p-panel'
    >
      <div className='flex flex-wrap items-center justify-between gap-cluster'>
        <h3 className='text-title text-primary'>TTS readiness</h3>
        <p className='text-caption text-subtle'>
          {readiness.readyCount}/{readiness.requiredCount} 준비됨
        </p>
      </div>

      <p className={readiness.ready ? 'text-success' : 'text-danger'}>
        {readiness.ready
          ? '필수 음성이 모두 준비되었습니다.'
          : '필수 음성이 준비되지 않았습니다.'}
      </p>

      {readiness.blockers.map((blocker) => (
        <article
          className='grid gap-cluster rounded-panel border border-default bg-surface p-panel'
          key={`${blocker.kind}:${blocker.targetId}`}
        >
          <p className='text-body text-primary'>
            {blocker.kind} · {blocker.mediaStatus}
          </p>
          {blocker.operation ? (
            <>
              <a
                className='text-accent underline'
                href={`/admin/tts/jobs/${blocker.operation.jobId}`}
              >
                TTS 작업 보기
              </a>
              {blocker.operation.itemStatus === 'FAILED' &&
              blocker.operation.retryable ? (
                <RetryTtsItemsAction
                  items={[
                    {
                      id: blocker.operation.itemId,
                      status: blocker.operation.itemStatus,
                      attempt: blocker.operation.attempt,
                      retryable: blocker.operation.retryable,
                    },
                  ]}
                  jobId={blocker.operation.jobId}
                />
              ) : null}
            </>
          ) : (
            <p className='text-caption text-subtle'>
              연결된 TTS 작업이 없습니다.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
