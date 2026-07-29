/** 콘텐츠 제작 실행 화면의 preset·최근 작업을 route 진입 전에 준비한다 */
import { createFileRoute } from '@tanstack/react-router';
import {
  contentProductionJobsQueryOptions,
  ContentProductionConsolePageContainer,
  contentProductionPresetsQueryOptions,
} from '@/pages/content-production-console';

/** 등록된 관리자 경계에서 콘텐츠 제작 화면 query를 함께 prefetch한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-production/',
)({
  component: ContentProductionConsoleRoute,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        contentProductionPresetsQueryOptions(),
      ),
      context.queryClient.ensureQueryData(contentProductionJobsQueryOptions()),
    ]),
});

function ContentProductionConsoleRoute() {
  return <ContentProductionConsolePageContainer />;
}
