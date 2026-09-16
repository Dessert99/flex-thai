/** 문제 상세 Query와 Page 소유 cache 무효화를 조정한다 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/api';

import { questionDetailQueryOptions } from '../api/questionDetailQueries';
import { QuestionSolvingPageView } from './QuestionSolvingPageView';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

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
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>문제를 불러오고 있습니다.</p>
        </section>
      </div>
    );
  }
  if (isQuestionUnavailable(question.error)) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
          <h2 className='text-title text-primary'>
            이 문제는 지금 풀 수 없습니다.
          </h2>
          {<a href='/questions'>문제 목록으로</a>}
        </section>
      </div>
    );
  }
  if (question.isError || question.data === undefined) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
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
      </div>
    );
  }

  return (
    <div className='mx-auto w-full max-w-content flex-1 p-page'>
      <QuestionSolvingPageView
        detail={question.data}
        onSavedConfirmed={() => {
          void queryClient.invalidateQueries({
            queryKey: ['learner', 'questions'],
          });
        }}
      />
    </div>
  );
}

function isQuestionUnavailable(error: unknown) {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.code === 'QUESTION_UNAVAILABLE'
  );
}
