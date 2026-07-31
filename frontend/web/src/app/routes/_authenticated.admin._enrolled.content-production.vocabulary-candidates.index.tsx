/** 어휘 후보 목록의 strict URL filter와 query prefetch를 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import {
  parseVocabularyCandidateSearch,
  vocabularyCandidatesQueryOptions,
  VocabularyCandidateManagementPageContainer,
} from '@/pages/vocabulary-candidate-management';

/** 후보 filter cache를 route intent preload와 화면이 공유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-production/vocabulary-candidates/',
)({
  component: VocabularyCandidateManagementRoute,
  loaderDeps: ({ search }) => parseVocabularyCandidateSearch(search),
  loader: ({ context, deps }) =>
    (
      context as unknown as { queryClient: QueryClient }
    ).queryClient.ensureQueryData(vocabularyCandidatesQueryOptions(deps)),
  validateSearch: parseVocabularyCandidateSearch,
});

function VocabularyCandidateManagementRoute() {
  const search = parseVocabularyCandidateSearch(Route.useSearch());
  const navigate = Route.useNavigate();
  return (
    <VocabularyCandidateManagementPageContainer
      onSearchChange={(next) =>
        void navigate({ replace: true, search: next as never })
      }
      search={search}
    />
  );
}
