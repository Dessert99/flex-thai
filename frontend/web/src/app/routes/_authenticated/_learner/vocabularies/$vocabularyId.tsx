/** 검증된 UUID 어휘 상세 Page를 연결한다 */
import { vocabularyIdPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { VocabularyDetailPageContainer } from '@/pages/vocabulary-detail';

/** 계약 UUID만 상세 Query에 전달한다 */
export const Route = createFileRoute(
  '/_authenticated/_learner/vocabularies/$vocabularyId',
)({
  component: VocabularyDetailRoute,
  parseParams: (params) => vocabularyIdPathSchema.parse(params),
});

function VocabularyDetailRoute() {
  const { vocabularyId } = Route.useParams();
  return <VocabularyDetailPageContainer vocabularyId={vocabularyId} />;
}
