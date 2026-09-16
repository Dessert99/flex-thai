/** 검증된 문제 검색값과 목록 Page를 `/questions` index에 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { QuestionListPage } from '@/pages/learner/questions/QuestionListPage';

/** Router가 소유한 검색 변경을 replace navigation으로 반영한다 */
export const Route = createFileRoute('/_authenticated/_learner/questions/')({
  component: QuestionListRoute,
});

function QuestionListRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <QuestionListPage
      onSearchChange={(nextSearch) => {
        void navigate({ replace: true, search: nextSearch });
      }}
      search={search}
    />
  );
}
