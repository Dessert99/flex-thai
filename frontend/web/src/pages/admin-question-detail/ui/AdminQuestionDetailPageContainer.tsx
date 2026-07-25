/** 관리자 문제 상세 Query를 불변 버전 inspection View에 연결한다 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QuestionStateAction } from '@/features/change-question-state';
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
        if (
          version.status === 'DRAFT' &&
          version.validation.status === 'PASSED'
        ) {
          return (
            <QuestionStateAction
              command={{ action: 'publish', versionId: version.id }}
              onConfirmed={() => void refreshQuestions()}
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
