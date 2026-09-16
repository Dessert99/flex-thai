/** 학습자 개념 목록을 URL category와 연결한다 */
import { conceptListQuerySchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { ConceptListPageContainer } from '@/pages/concept-list';

/** 개념 영역을 strict search로 검증해 목록을 렌더링한다 */
export const Route = createFileRoute('/_authenticated/_learner/concepts/')({
  component: ConceptListRoute,
  validateSearch: (search) => conceptListQuerySchema.parse(search),
});

function ConceptListRoute() {
  const { category } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ConceptListPageContainer
      category={category}
      onCategoryChange={(nextCategory) =>
        void navigate({
          replace: true,
          search: { category: nextCategory },
        })
      }
    />
  );
}
