/** 완료 단어 연습 query 상태를 결과 화면에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { vocabularyPracticeResultQueryOptions } from '../api/vocabularyPracticeResultQuery';
import { VocabularyPracticeResultPageView } from './VocabularyPracticeResultPageView';

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
    return <PageLoading message='연습 결과를 불러오고 있습니다.' />;
  }
  if (session.isError || session.data === undefined) {
    return (
      <PageError
        message='연습 결과를 불러오지 못했습니다.'
        onRetry={() => void session.refetch()}
      />
    );
  }
  if (session.data.status === 'ACTIVE') return null;
  return (
    <VocabularyPracticeResultPageView
      onContinue={onContinue}
      session={session.data}
    />
  );
}
