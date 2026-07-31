/** 관리자 홈 최근 목록과 운영 집계 query의 부분 성공을 보존한다 */
import { useQueries } from '@tanstack/react-query';
import { adminHomeQueryOptions } from '../api/adminHomeQueries';
import { AdminHomePageView } from './AdminHomePageView';

/** 최근 콘텐츠와 전체 운영 집계를 독립 화면 상태로 조합한다 */
export function AdminHomePageContainer() {
  const [questions, vocabularies, auditLogs, operations] = useQueries({
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
      onRetryOperations={() => {
        void operations.refetch();
      }}
      auditLogs={auditLogs.data?.items ?? []}
      auditLogsError={auditLogs.isError}
      auditLogsLoading={auditLogs.isPending}
      questions={questions.data?.items ?? []}
      questionsError={questions.isError}
      questionsLoading={questions.isPending}
      operations={operations.data}
      operationsError={operations.isError}
      operationsLoading={operations.isPending}
      vocabularies={vocabularies.data?.items ?? []}
      vocabulariesError={vocabularies.isError}
      vocabulariesLoading={vocabularies.isPending}
    />
  );
}
