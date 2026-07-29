/** 관리자 TTS 작업 목록 query key와 strict 응답 요청을 정의한다 */
import {
  ttsJobListResponseSchema,
  type TtsJobListQuery,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** TTS 작업 검색값별 stable TanStack Query 옵션을 만든다 */
export function ttsJobListQueryOptions(search: TtsJobListQuery) {
  const query = new URLSearchParams();
  (['status', 'from', 'to', 'page', 'pageSize'] as const).forEach((key) => {
    const value = search[key];
    if (value !== undefined) query.set(key, String(value));
  });
  return queryOptions({
    queryKey: ['admin', 'tts', 'jobs', 'list', search] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/tts/jobs?${query}`,
        response: { kind: 'json', schema: ttsJobListResponseSchema },
        signal,
      }),
  });
}
