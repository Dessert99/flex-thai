import { adminHomeQueryOptions } from '@/features/operations/apis/admin-home/adminHomeQueries';
import type { AdminHomePageViewProps } from '@/features/operations/libs/admin-home/adminHomePageTypes';
import { useQueries } from '@tanstack/react-query';

export function useAdminHome(): AdminHomePageViewProps {
  const [questions, vocabularies, auditLogs, operations, usageCost] =
    useQueries({
      queries: adminHomeQueryOptions(),
    });
  return {
    onRetryQuestions: () => {
      void questions.refetch();
    },
    onRetryAuditLogs: () => {
      void auditLogs.refetch();
    },
    onRetryVocabularies: () => {
      void vocabularies.refetch();
    },
    onRetryOperations: () => {
      void operations.refetch();
    },
    onRetryUsageCost: () => {
      void usageCost.refetch();
    },
    auditLogs: auditLogs.data?.items ?? [],
    auditLogsError: auditLogs.isError,
    auditLogsLoading: auditLogs.isPending,
    questions: questions.data?.items ?? [],
    questionsError: questions.isError,
    questionsLoading: questions.isPending,
    operations: operations.data,
    operationsError: operations.isError,
    operationsLoading: operations.isPending,
    usageCost: usageCost.data,
    usageCostError: usageCost.isError,
    usageCostLoading: usageCost.isPending,
    vocabularies: vocabularies.data?.items ?? [],
    vocabulariesError: vocabularies.isError,
    vocabulariesLoading: vocabularies.isPending,
  };
}
