/** 관리자 TTS 작업 page가 목록 server state를 소유한다 */
import type { TtsJobListQuery } from '@flex-thia/contracts';
import { useQuery } from '@tanstack/react-query';
import { ttsJobListQueryOptions } from '../api/ttsOperationsQueries';
import { TtsOperationsPageView } from './TtsOperationsPageView';

/** route가 정규화한 검색값으로 TTS 작업 page를 조회한다 */
export function TtsOperationsPageContainer({
  search,
}: {
  search: TtsJobListQuery;
}) {
  const query = useQuery(ttsJobListQueryOptions(search));
  return (
    <TtsOperationsPageView
      data={query.data}
      error={query.error}
      loading={query.isPending}
      onRetry={() => void query.refetch()}
    />
  );
}
