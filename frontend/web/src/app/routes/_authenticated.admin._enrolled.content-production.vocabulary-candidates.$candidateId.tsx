/** 어휘 후보 UUID 상세 화면과 query prefetch를 연결한다 */
import { vocabularyCandidatePathSchema } from '@flex-thia/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  vocabularyCandidateQueryOptions,
  VocabularyCandidateDetailPageContainer,
} from '@/pages/vocabulary-candidate-detail';

/** 검증된 어휘 후보 UUID의 상세 cache를 route와 화면이 공유한다 */
export const Route = createFileRoute(
  // 통합 branch의 routeTree 생성 전에도 새 route module을 독립 typecheck한다.
  '/_authenticated/admin/_enrolled/content-production/vocabulary-candidates/$candidateId' as never,
)({
  component: VocabularyCandidateDetailRoute,
  loader: ({ context, params }) =>
    (
      context as unknown as { queryClient: QueryClient }
    ).queryClient.ensureQueryData(
      vocabularyCandidateQueryOptions(
        vocabularyCandidatePathSchema.parse(params).candidateId,
      ),
    ),
  parseParams: (params: Record<string, unknown>) =>
    vocabularyCandidatePathSchema.parse(params),
});

function VocabularyCandidateDetailRoute() {
  const { candidateId } = vocabularyCandidatePathSchema.parse(
    Route.useParams(),
  );
  return <VocabularyCandidateDetailPageContainer candidateId={candidateId} />;
}
