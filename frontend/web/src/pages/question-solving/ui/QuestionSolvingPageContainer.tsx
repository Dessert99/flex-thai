/** 문제 상세 Query와 Page 소유 cache 무효화를 조정한다 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';
import { PageEmpty, PageError, PageLoading } from '@/shared/ui/page-state';
import { questionDetailQueryOptions } from '../api/questionDetailQueries';
import { QuestionSolvingPageView } from './QuestionSolvingPageView';

interface QuestionSolvingPageContainerProps {
  questionId: string;
}

/** 가용성 충돌을 복구 상태로 분리하고 성공 상세만 View에 전달한다 */
export function QuestionSolvingPageContainer({
  questionId,
}: QuestionSolvingPageContainerProps) {
  const queryClient = useQueryClient();
  const question = useQuery(questionDetailQueryOptions(questionId));

  if (question.isPending) {
    return <PageLoading message='문제를 불러오고 있습니다.' />;
  }
  if (isQuestionUnavailable(question.error)) {
    return (
      <PageEmpty
        action={<a href='/questions'>문제 목록으로</a>}
        title='이 문제는 지금 풀 수 없습니다.'
      />
    );
  }
  if (question.isError || question.data === undefined) {
    return (
      <PageError
        message='문제를 불러오지 못했습니다.'
        onRetry={() => {
          void question.refetch();
        }}
      />
    );
  }

  return (
    <QuestionSolvingPageView
      detail={question.data}
      onSavedConfirmed={() => {
        void queryClient.invalidateQueries({
          queryKey: ['learner', 'questions'],
        });
      }}
    />
  );
}

function isQuestionUnavailable(error: unknown) {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.code === 'QUESTION_UNAVAILABLE'
  );
}
