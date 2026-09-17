/** 관리자 문제 상세 index를 inspection Page에 연결한다 */
import { AdminQuestionDetailPage } from '@/pages/admin/questions/AdminQuestionDetailPage';
import { createFileRoute } from '@tanstack/react-router';

/** Outlet 부모가 검증한 문제 UUID로 상세를 렌더링한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/questions/$questionId/',
)({
  component: AdminQuestionDetailRoute,
});

function AdminQuestionDetailRoute() {
  const { questionId } = Route.useParams();
  return <AdminQuestionDetailPage questionId={questionId} />;
}
