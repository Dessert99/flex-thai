/** 검증된 개념 UUID를 관리자 상세 Page에 연결한다 */
import { conceptIdPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { AdminConceptDetailPageContainer } from '@/pages/admin-concept-detail';

/** 개념 UUID를 계약으로 검증한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/concepts/$conceptId',
)({
  component: AdminConceptDetailRoute,
  parseParams: (params) => conceptIdPathSchema.parse(params),
});

function AdminConceptDetailRoute() {
  const { conceptId } = Route.useParams();
  return <AdminConceptDetailPageContainer conceptId={conceptId} />;
}
