/** 검증된 개념 UUID를 학습자 상세 Page에 연결한다 */
import { conceptIdPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { ConceptDetailPageContainer } from '@/pages/concept-detail';

/** 개념 UUID를 계약으로 검증한다 */
export const Route = createFileRoute(
  '/_authenticated/_learner/concepts/$conceptId',
)({
  component: ConceptDetailRoute,
  parseParams: (params) => conceptIdPathSchema.parse(params),
});

function ConceptDetailRoute() {
  const { conceptId } = Route.useParams();
  return <ConceptDetailPageContainer conceptId={conceptId} />;
}
