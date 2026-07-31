/** 관리자 TTS 작업 상세 query key와 strict 요청을 정의한다 */
import {
  ttsJobDetailResponseSchema,
  type TtsJobItemsQuery,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** TTS job과 항목 filter별 상세 Query 옵션을 만든다 */
export function adminTtsJobDetailQueryOptions(
  jobId: string,
  search: TtsJobItemsQuery,
) {
  const query = new URLSearchParams();
  (['status', 'errorCode', 'page', 'pageSize'] as const).forEach((key) => {
    const value = search[key];
    if (value !== undefined) query.set(key, String(value));
  });
  return queryOptions({
    queryKey: ['admin', 'tts', 'jobs', 'detail', jobId, search] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/tts/jobs/${jobId}?${query}`,
        response: { kind: 'json', schema: ttsJobDetailResponseSchema },
        signal,
      }),
  });
}
