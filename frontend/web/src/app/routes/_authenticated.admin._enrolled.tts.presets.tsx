/** TTS preset catalog의 strict URL filter와 query prefetch를 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import {
  parseTtsPresetSearch,
  ttsPresetListQueryOptions,
  TtsPresetManagementPageContainer,
} from '@/pages/tts-preset-management';

/** TTS preset filter cache를 route intent preload와 화면이 공유한다 */
export const Route = createFileRoute(
  '/_authenticated/admin/_enrolled/tts/presets',
)({
  component: TtsPresetManagementRoute,
  loaderDeps: ({ search }) => parseTtsPresetSearch(search),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(ttsPresetListQueryOptions(deps)),
  validateSearch: parseTtsPresetSearch,
});

function TtsPresetManagementRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <TtsPresetManagementPageContainer
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
