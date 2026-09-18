import { ContentErrorReportDialog } from '@/features/learning/components/report-content-error/ContentErrorReportDialog';
import { SubmitAnswerForm } from '@/features/learning/components/submit-answer/SubmitAnswerForm';
import { SavedQuestionButton } from '@/features/learning/components/toggle-saved-question/SavedQuestionButton';
import { useQuestionSolving } from '@/features/learning/hooks/question-solving/useQuestionSolving';
import { isApiError } from '@/shared/apis/ApiError';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import type {
  QuestionDetailResponse,
  SubmitQuestionAttemptResponse,
} from '@flex-thia/contracts/learning/questions';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

function isQuestionUnavailable(error: unknown) {
  return (
    isApiError(error) &&
    error.detail.kind === 'problem' &&
    error.detail.problem.code === 'QUESTION_UNAVAILABLE'
  );
}
export function QuestionSolvingPage(
  pageInput: Parameters<typeof useQuestionSolving>[0],
) {
  const { queryClient, question } = useQuestionSolving(pageInput);

  if (question.isPending) {
    return (
      <Container className='max-w-content flex-1'>
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
      </Container>
    );
  }

  if (isQuestionUnavailable(question.error)) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
            <h2 className='text-title text-primary'>
              이 문제는 지금 풀 수 없습니다.
            </h2>
            {<Link to='/questions'>문제 목록으로</Link>}
          </section>
        </>
      </Container>
    );
  }

  if (question.isError || question.data === undefined) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <Alert
            className='rounded-panel border-danger bg-danger-surface'
            variant='destructive'
          >
            <AlertTitle className='text-danger'>
              문제가 발생했습니다.
            </AlertTitle>
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
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <>
        <QuestionSolvingContent
          key={`${question.data?.questionId}:${question.data?.questionVersion}`}
          detail={question.data}
          onSavedConfirmed={() => {
            void queryClient.invalidateQueries({
              queryKey: ['learner', 'questions'],
            });
          }}
        />
      </>
    </Container>
  );
}
/** 외부 번역 확장에서 선택할 수 있는 일반 텍스트로 문제를 표시한다. */

export function QuestionSolvingContent({
  detail,
  onSavedConfirmed,
}: {
  detail: QuestionDetailResponse;
  onSavedConfirmed: () => void;
}) {
  const [submission, setSubmission] = useState<SubmitQuestionAttemptResponse>();
  return (
    <article className='grid gap-section'>
      <header className='flex flex-wrap items-center justify-between gap-cluster'>
        <h1 className='text-title text-primary'>
          {detail.questionType.displayName}
        </h1>
        <div className='flex gap-cluster'>
          <ContentErrorReportDialog
            origin={{
              kind: 'QUESTION',
              questionId: detail.questionId,
              questionVersion: detail.questionVersion,
              blockId: null,
              sentenceVersionId: null,
            }}
            preview={{
              title: detail.questionType.displayName,
              metadata: `버전 ${detail.questionVersion}`,
            }}
            triggerLabel='문제 오류 신고'
          />
          <SavedQuestionButton
            onConfirmed={onSavedConfirmed}
            questionId={detail.questionId}
            saved={detail.saved}
          />
        </div>
      </header>
      {detail.firstResult === 'UPDATED' ? (
        <p role='status'>문제가 수정되었습니다. 다시 풀어보세요.</p>
      ) : null}
      {detail.passage ? (
        <p
          lang='th'
          className='whitespace-pre-wrap font-thai text-body'
        >
          {detail.passage}
        </p>
      ) : null}
      <p
        lang='th'
        className='whitespace-pre-wrap font-thai text-body'
      >
        {detail.prompt}
      </p>
      <SubmitAnswerForm
        questionId={detail.questionId}
        questionVersion={detail.questionVersion}
        options={detail.options}
        onConfirmed={setSubmission}
        onReset={() => setSubmission(undefined)}
      />
      {submission ? (
        <section className='grid gap-cluster'>
          <h2 className='text-title'>해설</h2>
          <p className='whitespace-pre-wrap'>
            {submission.feedback.explanation}
          </p>
        </section>
      ) : null}
    </article>
  );
}
