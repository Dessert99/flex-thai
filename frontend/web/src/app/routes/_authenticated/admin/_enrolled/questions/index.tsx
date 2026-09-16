/** 관리자 문제 목록을 route prefetch와 URL 검색값에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { adminQuestionListQueryOptions } from '@/features/learning/apis/question-management/adminQuestionQueries';
import { parseAdminQuestionSearch } from '@/features/learning/libs/question-management/adminQuestionSearch';
import { QuestionManagementPage } from '@/pages/admin/questions/QuestionManagementPage';

/** 동일 queryOptions로 intent preload와 Page cache를 공유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/questions/',
)({
  component: QuestionManagementRoute,
  loaderDeps: ({ search }) => parseAdminQuestionSearch(search),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(adminQuestionListQueryOptions(deps)),
});

function QuestionManagementRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <QuestionManagementPage
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
