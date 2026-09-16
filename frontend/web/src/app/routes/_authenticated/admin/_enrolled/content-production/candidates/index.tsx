/** 문제 후보 목록의 strict URL filter와 query prefetch를 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import {
  parseQuestionCandidateSearch,
  questionCandidatesQueryOptions,
  QuestionCandidateManagementPageContainer,
} from '@/pages/question-candidate-management';

/** 후보 filter cache를 route intent preload와 화면이 공유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-production/candidates/',
)({
  component: QuestionCandidateManagementRoute,
  loaderDeps: ({ search }) => parseQuestionCandidateSearch(search),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(questionCandidatesQueryOptions(deps)),
  validateSearch: parseQuestionCandidateSearch,
});

function QuestionCandidateManagementRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <QuestionCandidateManagementPageContainer
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
