/** 단어 연습 세션 query와 답안 command를 화면에 연결한다 */
import { useQuery } from '@tanstack/react-query';
import { answerVocabularyPractice } from '@/features/answer-vocabulary-practice';
import { PageError, PageLoading } from '@/shared/ui/page-state';
import { vocabularyPracticeSessionQueryOptions } from '../api/vocabularyPracticeSessionQuery';
import { VocabularyPracticeSessionPageView } from './VocabularyPracticeSessionPageView';

/** 세션 loading/error와 답안 제출을 조정한다 */
export function VocabularyPracticeSessionPageContainer({
  sessionId,
}: {
  sessionId: string;
}) {
  const session = useQuery(vocabularyPracticeSessionQueryOptions(sessionId));
  if (session.isPending) {
    return <PageLoading message='단어 연습을 불러오고 있습니다.' />;
  }
  if (session.isError || session.data === undefined) {
    return (
      <PageError
        message='단어 연습을 불러오지 못했습니다.'
        onRetry={() => void session.refetch()}
      />
    );
  }
  return (
    <VocabularyPracticeSessionPageView
      onAnswer={(questionId, request) =>
        answerVocabularyPractice(sessionId, questionId, request)
      }
      session={session.data}
    />
  );
}
