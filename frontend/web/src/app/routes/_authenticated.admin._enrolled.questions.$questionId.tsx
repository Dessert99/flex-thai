/** 관리자 문제 UUID의 상세 prefetch와 하위 작업 Outlet을 정의한다 */
import { adminQuestionIdPathSchema } from '@flex-thia/contracts';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { adminQuestionDetailQueryOptions } from '@/pages/admin-question-detail';

/** 상세와 후속 버전 작업이 같은 문제 Query cache를 사용한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/questions/$questionId',
)({
  component: AdminQuestionDetailRoutes,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      adminQuestionDetailQueryOptions(params.questionId),
    ),
  parseParams: (params) => adminQuestionIdPathSchema.parse(params),
});

function AdminQuestionDetailRoutes() {
  return <Outlet />;
}
