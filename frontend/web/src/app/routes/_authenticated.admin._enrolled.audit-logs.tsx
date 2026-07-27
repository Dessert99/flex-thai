/** 관리자 감사 기록 URL 상태와 Page를 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import {
  AuditLogManagementPage,
  parseAuditLogSearch,
} from '@/pages/audit-log-management';

/** 등록된 관리자 guard 아래에서 감사 기록을 렌더링한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/audit-logs',
)({
  component: AuditLogManagementRoute,
  validateSearch: parseAuditLogSearch,
});

function AuditLogManagementRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AuditLogManagementPage
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
