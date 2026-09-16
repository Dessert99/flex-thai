/** 사용량·비용 overview와 singleton 설정을 route 진입 전에 준비한다 */
import { createFileRoute } from '@tanstack/react-router';
import { parseUsageCostSearch } from '@/features/operations/libs/usage-cost-operations/usageCostSearch';
import { UsageCostOperationsPage } from '@/pages/UsageCostOperationsPage';
import {
  usageCostOverviewQueryOptions,
  usageCostSettingsQueryOptions,
} from '@/features/operations/apis/usage-cost-operations/usageCostQueries';

/** URL filter별 overview와 공용 비용 설정 cache를 함께 prefetch한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/usage-cost',
)({
  component: UsageCostOperationsRoute,
  loaderDeps: ({ search }) => parseUsageCostSearch(search),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(usageCostOverviewQueryOptions(deps)),
      context.queryClient.ensureQueryData(usageCostSettingsQueryOptions()),
    ]),
  validateSearch: parseUsageCostSearch,
});

function UsageCostOperationsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <UsageCostOperationsPage
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
