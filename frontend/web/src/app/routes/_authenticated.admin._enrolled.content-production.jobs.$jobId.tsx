/** 콘텐츠 제작 작업 UUID 상세 화면과 query prefetch를 연결한다 */
import { contentProductionJobPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import {
  contentProductionJobQueryOptions,
  ContentProductionJobDetailPageContainer,
} from '@/pages/content-production-job-detail';

/** 검증된 작업 UUID의 상세 cache를 route와 화면이 공유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-production/jobs/$jobId',
)({
  component: ContentProductionJobDetailRoute,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      contentProductionJobQueryOptions(params.jobId),
    ),
  parseParams: (params) => contentProductionJobPathSchema.parse(params),
});

function ContentProductionJobDetailRoute() {
  const { jobId } = Route.useParams();
  return <ContentProductionJobDetailPageContainer jobId={jobId} />;
}
