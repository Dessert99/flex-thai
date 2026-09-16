/** 문제 후보 UUID 상세 화면과 query prefetch를 연결한다 */
import { questionCandidatePathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import {
  questionCandidateQueryOptions,
  QuestionCandidateDetailPageContainer,
} from '@/pages/question-candidate-detail';

/** 검증된 후보 UUID의 상세 cache를 route와 화면이 공유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-production/candidates/$candidateId',
)({
  component: QuestionCandidateDetailRoute,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      questionCandidateQueryOptions(params.candidateId),
    ),
  parseParams: (params) => questionCandidatePathSchema.parse(params),
});

function QuestionCandidateDetailRoute() {
  const { candidateId } = Route.useParams();
  return <QuestionCandidateDetailPageContainer candidateId={candidateId} />;
}
