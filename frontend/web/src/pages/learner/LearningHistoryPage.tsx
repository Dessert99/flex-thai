import { useLearningHistory } from '@/features/learning/hooks/learning-history/useLearningHistory';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';
import { Container } from '@/shared/components/layouts/Container';
import { Skeleton } from '@/shared/components/skeleton';
import { formatLocalDateTime } from '@/shared/libs/date/formatLocalDateTime';
import type { QuestionAttemptListResponse } from '@flex-thia/contracts/learning/questions';
import { Link } from '@tanstack/react-router';
/** 화면 배치와 기능 컴포넌트를 페이지에서 직접 조립한다 */

export function LearningHistoryPage() {
  const { attempts } = useLearningHistory();

  if (attempts.isPending) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section
            aria-live='polite'
            className='flex min-h-state flex-col justify-center gap-cluster p-page'
            role='status'
          >
            <Skeleton className='h-control w-full max-w-content' />
            <p className='text-body text-subtle'>
              학습 기록을 불러오고 있습니다.
            </p>
          </section>
        </>
      </Container>
    );
  }

  if (attempts.isError || attempts.data === undefined) {
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
              <p>학습 기록을 불러오지 못했습니다.</p>
              <Button
                className='mt-cluster w-auto'
                onClick={() => {
                  void attempts.refetch();
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

  if (attempts.data.items.length === 0) {
    return (
      <Container className='max-w-content flex-1'>
        <>
          <section className='flex min-h-state flex-col items-center justify-center gap-cluster rounded-panel border border-default bg-surface-muted p-page text-center'>
            <h2 className='text-title text-primary'>
              아직 풀이 기록이 없습니다.
            </h2>
          </section>
        </>
      </Container>
    );
  }

  return (
    <Container className='max-w-content flex-1'>
      <>
        <LearningHistoryContent attempts={attempts.data.items} />
      </>
    </Container>
  );
}
/** 학습자의 원시 풀이 기록을 통계 없이 시간순 목록으로 표현한다 */

interface LearningHistoryPageViewProps {
  attempts: QuestionAttemptListResponse['items'];
}

/** 시도 번호·정오답·원본 datetime을 그대로 보존해 표시한다 */
export function LearningHistoryContent({
  attempts,
}: LearningHistoryPageViewProps) {
  return (
    <section className='grid gap-section'>
      <h1 className='text-title text-primary'>오답 기록</h1>
      <ul className='grid gap-cluster'>
        {attempts.map((attempt) => (
          <li
            className='grid gap-cluster rounded-panel border border-default bg-surface p-page'
            key={attempt.id}
          >
            <Link
              className='text-body text-primary'
              to='/questions/$questionId'
              params={{ questionId: attempt.questionId }}
            >
              {attempt.attemptNo}번째 시도 · 문제 버전 {attempt.questionVersion}
            </Link>
            <span className='text-body text-subtle'>
              {attempt.isCorrect ? '정답' : '오답'}
            </span>
            <details>
              <summary>풀이 당시 문제와 해설</summary>
              <p>
                문제 수정일:{' '}
                {formatLocalDateTime(attempt.questionSnapshot.updatedAt)}
              </p>
              <p
                lang='th'
                className='whitespace-pre-wrap'
              >
                {attempt.questionSnapshot.passage}
              </p>
              <p
                lang='th'
                className='whitespace-pre-wrap'
              >
                {attempt.questionSnapshot.prompt}
              </p>
              <ul>
                {attempt.questionSnapshot.options.map((option) => (
                  <li key={option.id}>
                    {option.text}
                    {option.id === attempt.selectedOptionId
                      ? ' · 선택한 답'
                      : ''}
                    {option.id === attempt.questionSnapshot.correctOptionId
                      ? ' · 정답'
                      : ''}
                  </li>
                ))}
              </ul>
              <p className='whitespace-pre-wrap'>
                {attempt.questionSnapshot.explanation}
              </p>
            </details>
            <time
              className='text-caption text-subtle'
              dateTime={attempt.submittedAt}
            >
              {formatLocalDateTime(attempt.submittedAt)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
