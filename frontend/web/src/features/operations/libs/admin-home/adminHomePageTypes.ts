import type { AdminVocabularyListResponse } from '@flex-thia/contracts/admin/vocabularies';
import type { AdminHomeOperationsResponse } from '@flex-thia/contracts/operations/admin-home';
import type { AuditLogListResponse } from '@flex-thia/contracts/operations/audit-logs';
import type { UsageCostOverviewResponse } from '@flex-thia/contracts/operations/usage-cost';
export interface AdminHomePageViewProps {
  auditLogs: AuditLogListResponse['items'];
  auditLogsError: boolean;
  auditLogsLoading: boolean;
  onRetryAuditLogs: () => void;
  onRetryOperations: () => void;
  onRetryUsageCost: () => void;
  onRetryVocabularies: () => void;
  operations: AdminHomeOperationsResponse | undefined;
  operationsError: boolean;
  operationsLoading: boolean;
  usageCost: UsageCostOverviewResponse | undefined;
  usageCostError: boolean;
  usageCostLoading: boolean;
  vocabularies: AdminVocabularyListResponse['items'];
  vocabulariesError: boolean;
  vocabulariesLoading: boolean;
}
