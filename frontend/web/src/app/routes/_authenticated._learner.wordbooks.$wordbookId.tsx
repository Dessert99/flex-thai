/** 검증된 단어장 UUID와 검색값을 상세 Page에 연결한다 */
import { wordbookIdPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import {
  parseWordbookDetailSearch,
  WordbookDetailPageContainer,
} from '@/pages/wordbook-detail';

/** 계약 UUID와 검색값만 상세 Query에 전달한다 */
export const Route = createFileRoute(
  '/_authenticated/_learner/wordbooks/$wordbookId',
)({
  component: WordbookDetailRoute,
  parseParams: (params) => wordbookIdPathSchema.parse(params),
  validateSearch: parseWordbookDetailSearch,
});

function WordbookDetailRoute() {
  const { wordbookId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WordbookDetailPageContainer
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
      wordbookId={wordbookId}
    />
  );
}
