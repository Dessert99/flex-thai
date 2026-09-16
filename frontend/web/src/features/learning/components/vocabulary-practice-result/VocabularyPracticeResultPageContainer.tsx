/** 완료 단어 연습 query 상태를 결과 화면에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { vocabularyPracticeResultQueryOptions } from '../../apis/vocabulary-practice-result/vocabularyPracticeResultQuery';
import { VocabularyPracticeResultPageView } from './VocabularyPracticeResultPageView';
import { Skeleton } from '@/shared/components/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert';
import { Button } from '@/shared/components/button';

/** 결과 세션 loading/error를 처리한다 */
export function VocabularyPracticeResultPageContainer({
  onContinue,
  sessionId,
}: {
  onContinue: (sessionId: string) => void;
  sessionId: string;
}) {
  const session = useQuery(vocabularyPracticeResultQueryOptions(sessionId));
  useEffect(() => {
    if (session.data?.status === 'ACTIVE') {
      onContinue(session.data.id);
    }
  }, [onContinue, session.data]);
  if (session.isPending) {
    return (
      <>
        <section
          aria-live='polite'
          className='flex min-h-state flex-col justify-center gap-cluster p-page'
          role='status'
        >
          <Skeleton className='h-control w-full max-w-content' />
          <p className='text-body text-subtle'>
            연습 결과를 불러오고 있습니다.
          </p>
        </section>
      </>
    );
  }
  if (session.isError || session.data === undefined) {
    return (
      <>
        <Alert
          className='rounded-panel border-danger bg-danger-surface'
          variant='destructive'
        >
          <AlertTitle className='text-danger'>문제가 발생했습니다.</AlertTitle>
          <AlertDescription className='flex flex-col gap-cluster text-danger'>
            <p>연습 결과를 불러오지 못했습니다.</p>
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
      </>
    );
  }
  if (session.data.status === 'ACTIVE') return <>null</>;
  return (
    <>
      <VocabularyPracticeResultPageView
        onContinue={onContinue}
        session={session.data}
      />
    </>
  );
}
