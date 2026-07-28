/** 관리자 TTS preset page가 catalog server state를 소유한다 */
import type { TtsVoicePresetListQuery } from '@flex-thia/contracts';
import { useQuery } from '@tanstack/react-query';
import { ttsPresetListQueryOptions } from '../api/ttsPresetQueries';
import { TtsPresetManagementPageView } from './TtsPresetManagementPageView';

/** route 검색값으로 TTS preset catalog를 조회한다 */
export function TtsPresetManagementPageContainer({
  search,
}: {
  search: TtsVoicePresetListQuery;
}) {
  const query = useQuery(ttsPresetListQueryOptions(search));
  return (
    <TtsPresetManagementPageView
      data={query.data}
      error={query.error}
      loading={query.isPending}
      onRetry={() => void query.refetch()}
    />
  );
}
