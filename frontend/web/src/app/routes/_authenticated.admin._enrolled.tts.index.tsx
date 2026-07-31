/** TTS 작업 목록의 strict URL filter와 query prefetch를 연결한다 */
import { createFileRoute } from '@tanstack/react-router';
import {
  parseTtsOperationsSearch,
  ttsJobListQueryOptions,
  TtsOperationsPageContainer,
} from '@/pages/tts-operations';

/** TTS 작업 filter cache를 route intent preload와 화면이 공유한다 */
export const Route = createFileRoute('/_authenticated/admin/_enrolled/tts/')({
  component: TtsOperationsRoute,
  loaderDeps: ({ search }) => parseTtsOperationsSearch(search),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(ttsJobListQueryOptions(deps)),
  validateSearch: parseTtsOperationsSearch,
});

function TtsOperationsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <TtsOperationsPageContainer
      onSearchChange={(next) => void navigate({ replace: true, search: next })}
      search={search}
    />
  );
}
