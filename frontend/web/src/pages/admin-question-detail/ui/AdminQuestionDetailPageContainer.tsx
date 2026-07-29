/** 관리자 문제 상세 Query를 불변 버전 inspection View에 연결한다 */
import type { AdminQuestionDetailResponse } from '@flex-thia/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { QuestionStateAction } from '@/features/change-question-state';
import { RetryTtsItemsAction } from '@/features/retry-tts-items';
import {
  TtsPublicationReadinessPanel,
  ttsPublicationReadinessQueryOptions,
} from '@/features/tts-publication-readiness';
import { Button } from '@/shared/ui/button';
import { adminQuestionDetailQueryOptions } from '../api/adminQuestionDetailQueries';
import { AdminQuestionDetailPageView } from './AdminQuestionDetailPageView';
import { CloneQuestionVersionButton } from './CloneQuestionVersionButton';

interface AdminQuestionDetailPageContainerProps {
  onCloned?: (result: { questionId: string; versionId: string }) => void;
  questionId: string;
}

/** route가 검증한 문제 UUID의 서버 상세 상태를 소유한다 */
export function AdminQuestionDetailPageContainer({
  onCloned = () => undefined,
  questionId,
}: AdminQuestionDetailPageContainerProps) {
  const queryClient = useQueryClient();
  const detail = useQuery(adminQuestionDetailQueryOptions(questionId));
  const refreshQuestions = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['admin', 'questions', 'detail', questionId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['admin', 'questions', 'list'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['admin', 'tts', 'readiness'],
      }),
    ]);
  return (
    <AdminQuestionDetailPageView
      actions={
        detail.data ? (
          <>
            <CloneQuestionVersionButton
              onCloned={onCloned}
              questionId={questionId}
            />
            <QuestionStateAction
              command={
                detail.data.status === 'HIDDEN'
                  ? { action: 'restore', questionId }
                  : { action: 'hide', questionId }
              }
              onConfirmed={() => void refreshQuestions()}
            />
          </>
        ) : null
      }
      data={detail.data}
      error={detail.error}
      loading={detail.isPending}
      onRetry={() => void detail.refetch()}
      renderVersionAction={(version) => {
        if (version.status === 'DRAFT') {
          return (
            <DraftVersionTtsState
              onConfirmed={refreshQuestions}
              questionId={questionId}
              version={version}
            />
          );
        }
        if (version.status === 'PUBLISHED') {
          return (
            <QuestionStateAction
              command={{ action: 'invalidate', versionId: version.id }}
              onConfirmed={() => void refreshQuestions()}
            />
          );
        }
        return null;
      }}
    />
  );
}

type QuestionVersion = AdminQuestionDetailResponse['versions'][number];

/** DRAFT마다 독립 readiness query를 소유해 게시 조건과 validation을 함께 지킨다 */
function DraftVersionTtsState({
  onConfirmed,
  questionId,
  version,
}: {
  onConfirmed: () => Promise<unknown>;
  questionId: string;
  version: QuestionVersion;
}) {
  const readiness = useQuery(
    ttsPublicationReadinessQueryOptions(questionId, version.id),
  );
  const validationPassed = version.validation.status === 'PASSED';
  let disabledReason = 'TTS 준비 상태를 확인한 뒤 게시할 수 있습니다.';
  if (readiness.isError) {
    disabledReason = 'TTS 준비 상태를 확인할 수 없어 게시할 수 없습니다.';
  } else if (readiness.data?.ready === false) {
    disabledReason = '필수 음성이 준비되지 않았습니다.';
  }
  let readinessPanel: ReactNode = (
    <p className='text-caption text-subtle'>
      TTS 준비 상태를 확인하고 있습니다.
    </p>
  );
  if (readiness.data) {
    readinessPanel = (
      <TtsPublicationReadinessPanel
        readiness={readiness.data}
        renderRetry={(operation) => (
          <RetryTtsItemsAction
            items={[
              {
                id: operation.itemId,
                status: operation.itemStatus,
                attempt: operation.attempt,
                retryable: operation.retryable,
              },
            ]}
            jobId={operation.jobId}
          />
        )}
      />
    );
  } else if (readiness.isError) {
    readinessPanel = (
      <div className='grid gap-cluster'>
        <p className='text-caption text-danger'>
          TTS 준비 상태를 불러오지 못했습니다.
        </p>
        <Button
          onClick={() => void readiness.refetch()}
          type='button'
          variant='outline'
        >
          TTS 준비 상태 다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className='grid gap-cluster'>
      {readinessPanel}
      {validationPassed ? (
        <QuestionStateAction
          command={{ action: 'publish', versionId: version.id }}
          disabled={readiness.data?.ready !== true}
          disabledReason={disabledReason}
          onConfirmed={() => void onConfirmed()}
        />
      ) : null}
    </div>
  );
}
