/** 관리자 TTS job 상세 page가 filter별 server state를 소유한다 */
import type { TtsJobItemsQuery } from '@flex-thia/contracts';
import { useQuery } from '@tanstack/react-query';
import { adminTtsJobDetailQueryOptions } from '../api/adminTtsJobDetailQueries';
import { AdminTtsJobDetailPageView } from './AdminTtsJobDetailPageView';

/** route가 검증한 job과 검색값으로 상세를 조회한다 */
export function AdminTtsJobDetailPageContainer({
  jobId,
  search,
}: {
  jobId: string;
  search: TtsJobItemsQuery;
}) {
  const query = useQuery(adminTtsJobDetailQueryOptions(jobId, search));
  return (
    <AdminTtsJobDetailPageView
      data={query.data}
      error={query.error}
      loading={query.isPending}
      onRetry={() => void query.refetch()}
    />
  );
}
