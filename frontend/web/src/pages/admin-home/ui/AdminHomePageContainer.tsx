/** 최근 관리자 문제·어휘·감사 기록 요청을 독립적으로 관리해 부분 성공을 보존한다 */
import { useQueries } from '@tanstack/react-query';
import { adminHomeQueryOptions } from '../api/adminHomeQueries';
import { AdminHomePageView } from './AdminHomePageView';

/** 관리자 홈의 세 서버 상태를 화면 상태로 조합한다 */
export function AdminHomePageContainer() {
  const [questions, vocabularies, auditLogs] = useQueries({
    queries: adminHomeQueryOptions(),
  });

  return (
    <AdminHomePageView
      onRetryQuestions={() => {
        void questions.refetch();
      }}
      onRetryAuditLogs={() => {
        void auditLogs.refetch();
      }}
      onRetryVocabularies={() => {
        void vocabularies.refetch();
      }}
      auditLogs={auditLogs.data?.items ?? []}
      auditLogsError={auditLogs.isError}
      questions={questions.data?.items ?? []}
      questionsError={questions.isError}
      vocabularies={vocabularies.data?.items ?? []}
      vocabulariesError={vocabularies.isError}
      waiting={
        questions.isPending || vocabularies.isPending || auditLogs.isPending
      }
    />
  );
}
