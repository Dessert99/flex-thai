/** 관리자 문제 상세 index를 inspection Page에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { AdminQuestionDetailPage } from '@/pages/AdminQuestionDetailPage';

/** Outlet 부모가 검증한 문제 UUID로 상세를 렌더링한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/questions/$questionId/',
)({
  component: AdminQuestionDetailRoute,
});

function AdminQuestionDetailRoute() {
  const { questionId } = Route.useParams();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <AdminQuestionDetailPage
      onCloned={({ questionId: nextQuestionId, versionId }) =>
        void navigate({
          params: { questionId: nextQuestionId, versionId },
          search,
          to: '/admin/questions/$questionId/versions/$versionId/replace',
        })
      }
      questionId={questionId}
    />
  );
}
