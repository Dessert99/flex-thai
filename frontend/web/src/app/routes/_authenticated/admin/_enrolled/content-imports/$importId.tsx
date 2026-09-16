/** 검증된 콘텐츠 가져오기 UUID를 상세 Page에 연결한다 */
import { contentImportIdPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { ContentImportDetailPageContainer } from '@/pages/content-import-detail';

/** 계약 UUID만 가져오기 상세 Query에 전달한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-imports/$importId',
)({
  component: ContentImportDetailRoute,
  parseParams: (params) => contentImportIdPathSchema.parse(params),
});

function ContentImportDetailRoute() {
  const { importId } = Route.useParams();
  return <ContentImportDetailPageContainer importId={importId} />;
}
