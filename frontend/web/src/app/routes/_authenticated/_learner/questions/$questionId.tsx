/** 문제 UUID를 검증해 단일 문제 풀이 Page에 연결한다 */
import { questionIdPathSchema } from '@flex-thia/contracts/learning/questions';
import { createFileRoute } from '@tanstack/react-router';
import { QuestionSolvingPage } from '@/pages/QuestionSolvingPage';

/** 계약 UUID만 상세 Query에 전달한다 */
export const Route = createFileRoute(
  '/_authenticated/_learner/questions/$questionId',
)({
  component: QuestionSolvingRoute,
  parseParams: (params) => questionIdPathSchema.parse(params),
});

function QuestionSolvingRoute() {
  const { questionId } = Route.useParams();
  return <QuestionSolvingPage questionId={questionId} />;
}
