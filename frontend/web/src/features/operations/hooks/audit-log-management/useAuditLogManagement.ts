import {
  auditLogDetailQueryOptions,
  auditLogListQueryOptions,
} from '@/features/operations/apis/audit-log-management/auditLogQueries';
import { type AuditLogSearch } from '@/features/operations/libs/audit-log-management/auditLogSearch';
import { useQuery } from '@tanstack/react-query';

interface AuditLogManagementPageProps {
  onSearchChange: (search: AuditLogSearch) => void;
  search: AuditLogSearch;
}
export function useAuditLogManagement({
  onSearchChange,
  search,
}: AuditLogManagementPageProps) {
  const list = useQuery(auditLogListQueryOptions(search));

  const detail = useQuery(auditLogDetailQueryOptions(search.selectedAuditId));

  const changeFilter = (patch: Partial<AuditLogSearch>) =>
    onSearchChange({ ...search, ...patch, page: 1 });
  return { onSearchChange, search, list, detail, changeFilter };
}
