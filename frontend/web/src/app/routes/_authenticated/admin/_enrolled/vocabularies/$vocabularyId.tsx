/** 계약 UUID 어휘 상세 route와 prefetch를 정의한다 */
import { adminVocabularyIdPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import {
  adminVocabularyDetailQueryOptions,
  AdminVocabularyDetailPageContainer,
} from '@/pages/admin-vocabulary-detail';

/** 검증된 UUID 상세 cache를 route와 Page가 공유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/vocabularies/$vocabularyId',
)({
  component: VocabularyDetailRoute,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      adminVocabularyDetailQueryOptions(params.vocabularyId),
    ),
  parseParams: (params) => adminVocabularyIdPathSchema.parse(params),
});

function VocabularyDetailRoute() {
  const { vocabularyId } = Route.useParams();
  return <AdminVocabularyDetailPageContainer vocabularyId={vocabularyId} />;
}
