/** 검증된 단어장 UUID와 검색값을 상세 Page에 연결한다 */
import { wordbookIdPathSchema } from '@flex-thia/contracts/learning/wordbooks';
import { createFileRoute } from '@tanstack/react-router';
import { parseWordbookDetailSearch } from '@/features/learning/libs/wordbook-detail/wordbookDetailSearch';
import { WordbookDetailPage } from '@/pages/WordbookDetailPage';

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
    <WordbookDetailPage
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
      wordbookId={wordbookId}
    />
  );
}
