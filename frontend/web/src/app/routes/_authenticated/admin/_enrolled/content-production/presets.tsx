/** 콘텐츠 제작 preset version 운영 화면과 query prefetch를 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import { contentProductionPresetVersionsQueryOptions } from '@/features/content-production/apis/manage-content-production-presets/contentProductionPresetApi';
import { ContentProductionPresetManagementPage } from '@/pages/admin/content-production/ContentProductionPresetManagementPage';

/** immutable preset version 목록을 route 진입 전에 준비한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/content-production/presets',
)({
  component: ContentProductionPresetManagementPage,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      contentProductionPresetVersionsQueryOptions(),
    ),
});
