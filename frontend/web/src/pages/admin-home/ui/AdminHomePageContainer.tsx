/** 최근 관리자 문제와 어휘 요청을 독립적으로 관리해 부분 성공을 보존한다 */
import { useQueries } from '@tanstack/react-query';
import { adminHomeQueryOptions } from '../api/adminHomeQueries';
import { AdminHomePageView } from './AdminHomePageView';

/** 관리자 홈의 두 서버 상태를 화면 상태로 조합한다 */
export function AdminHomePageContainer() {
  const [questions, vocabularies] = useQueries({
    queries: adminHomeQueryOptions(),
  });

  return (
    <AdminHomePageView
      onRetryQuestions={() => {
        void questions.refetch();
      }}
      onRetryVocabularies={() => {
        void vocabularies.refetch();
      }}
      questions={questions.data?.items ?? []}
      questionsError={questions.isError}
      vocabularies={vocabularies.data?.items ?? []}
      vocabulariesError={vocabularies.isError}
      waiting={questions.isPending || vocabularies.isPending}
    />
  );
}
