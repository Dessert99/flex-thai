/** 관리자 홈 카드별 query와 재시도를 분리해 부분 성공을 보존한다 */
import { useQueries } from '@tanstack/react-query';
import { adminHomeQueryOptions } from '../api/adminHomeQueries';
import { AdminHomePageView } from './AdminHomePageView';

/** 최근 콘텐츠와 운영 상태의 일곱 query를 독립 화면 상태로 조합한다 */
// eslint-disable-next-line complexity -- 일곱 독립 query의 optional data projection을 한 container가 소유한다.
export function AdminHomePageContainer() {
  const [
    questions,
    vocabularies,
    auditLogs,
    contentJobs,
    candidates,
    ttsJobs,
    usageCost,
  ] = useQueries({
    queries: adminHomeQueryOptions(),
  });

  return (
    <AdminHomePageView
      candidatesError={candidates.isError}
      candidatesLoading={candidates.isPending}
      candidatesPendingCount={candidates.data?.page.totalItems ?? 0}
      contentJobs={contentJobs.data?.items ?? []}
      contentJobsError={contentJobs.isError}
      contentJobsLoading={contentJobs.isPending}
      onRetryCandidates={() => {
        void candidates.refetch();
      }}
      onRetryContentJobs={() => {
        void contentJobs.refetch();
      }}
      onRetryQuestions={() => {
        void questions.refetch();
      }}
      onRetryAuditLogs={() => {
        void auditLogs.refetch();
      }}
      onRetryVocabularies={() => {
        void vocabularies.refetch();
      }}
      onRetryTtsJobs={() => {
        void ttsJobs.refetch();
      }}
      onRetryUsageCost={() => {
        void usageCost.refetch();
      }}
      auditLogs={auditLogs.data?.items ?? []}
      auditLogsError={auditLogs.isError}
      auditLogsLoading={auditLogs.isPending}
      questions={questions.data?.items ?? []}
      questionsError={questions.isError}
      questionsLoading={questions.isPending}
      ttsJobs={ttsJobs.data?.items ?? []}
      ttsJobsError={ttsJobs.isError}
      ttsJobsLoading={ttsJobs.isPending}
      usageCost={usageCost.data}
      usageCostError={usageCost.isError}
      usageCostLoading={usageCost.isPending}
      vocabularies={vocabularies.data?.items ?? []}
      vocabulariesError={vocabularies.isError}
      vocabulariesLoading={vocabularies.isPending}
    />
  );
}
