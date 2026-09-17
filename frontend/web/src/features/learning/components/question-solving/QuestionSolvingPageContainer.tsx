/** 문제 상세 Query와 Page 소유 cache 무효화를 조정한다 */
import { isApiError } from '@/shared/apis/ApiError';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Skeleton } from '@/shared/components/skeleton';
import { questionDetailQueryOptions } from '../../apis/question-solving/questionDetailQueries';
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
    return (
      <>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>문제를 불러오고 있습니다.</p>
        </section>
      </>
    );
  }
  if (isQuestionUnavailable(question.error)) {
    return (
      <>
        <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
          <h2 className='text-title text-primary'>
            이 문제는 지금 풀 수 없습니다.
          </h2>
          {<Link to='/questions'>문제 목록으로</Link>}
        </section>
      </>
    );
  }
  if (question.isError || question.data === undefined) {
    return (
      <>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>문제를 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={() => {
                void question.refetch();
              }}
              type='button'
              variant='outline'
            >
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <QuestionSolvingPageView
        key={`${question.data?.questionId}:${question.data?.questionVersion}`}
        detail={question.data}
        onSavedConfirmed={() => {
          void queryClient.invalidateQueries({
            queryKey: ['learner', 'questions'],
          });
        }}
      />
    </>
  );
}

function isQuestionUnavailable(error: unknown) {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.code === 'QUESTION_UNAVAILABLE'
  );
}
