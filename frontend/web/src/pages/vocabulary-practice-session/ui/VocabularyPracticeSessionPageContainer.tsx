/** 단어 연습 세션 query와 답안 command를 화면에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { answerVocabularyPractice } from '@/features/answer-vocabulary-practice';

import { vocabularyPracticeSessionQueryOptions } from '../api/vocabularyPracticeSessionQuery';
import { VocabularyPracticeSessionPageView } from './VocabularyPracticeSessionPageView';
import { Skeleton } from '@/shared/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

/** 세션 loading/error와 답안 제출을 조정한다 */
export function VocabularyPracticeSessionPageContainer({
  onShowResult,
  sessionId,
}: {
  onShowResult: (sessionId: string) => void;
  sessionId: string;
}) {
  const session = useQuery(vocabularyPracticeSessionQueryOptions(sessionId));
  if (session.isPending) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>
            단어 연습을 불러오고 있습니다.
          </p>
        </section>
      </div>
    );
  }
  if (session.isError || session.data === undefined) {
    return (
      <div className='mx-auto w-full max-w-content flex-1 p-page'>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>단어 연습을 불러오지 못했습니다.</p>
            <Button
              className='mt-cluster w-auto'
              onClick={() => void session.refetch()}
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
      <VocabularyPracticeSessionPageView
        onAnswer={(questionId, request) =>
          answerVocabularyPractice(sessionId, questionId, request)
        }
        onShowResult={onShowResult}
        session={session.data}
      />
    </div>
  );
}
