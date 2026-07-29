/** TTS 작업 UUID와 항목 filter 상세 화면의 query prefetch를 연결한다 */
import { ttsJobPathSchema } from '@flex-thia/contracts';
import { createFileRoute } from '@tanstack/react-router';
import {
  adminTtsJobDetailQueryOptions,
  AdminTtsJobDetailPageContainer,
  parseTtsJobItemsSearch,
} from '@/pages/admin-tts-job-detail';

/** 검증된 작업 UUID와 항목 filter cache를 route와 화면이 공유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/tts/jobs/$jobId',
)({
  component: AdminTtsJobDetailRoute,
  loaderDeps: ({ search }) => parseTtsJobItemsSearch(search),
  loader: ({ context, deps, params }) =>
    context.queryClient.ensureQueryData(
      adminTtsJobDetailQueryOptions(params.jobId, deps),
    ),
  parseParams: (params) => ttsJobPathSchema.parse(params),
  validateSearch: parseTtsJobItemsSearch,
});

function AdminTtsJobDetailRoute() {
  const { jobId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AdminTtsJobDetailPageContainer
      jobId={jobId}
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
