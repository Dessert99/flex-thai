/** TTS 작업 URL 검색값을 공개 query 계약으로 정규화한다 */
import {
  ttsJobListQuerySchema,
  type TtsJobListQuery,
} from '@flex-thia/contracts';

/** route search를 strict TTS 작업 검색값으로 변환한다 */
export function parseTtsOperationsSearch(value: unknown): TtsJobListQuery {
  return ttsJobListQuerySchema.parse(value);
}

/** filter patch 뒤 첫 page로 돌아가고 빈 값을 제거한다 */
export function updateTtsOperationsSearch(
  current: TtsJobListQuery,
  patch: Partial<TtsJobListQuery>,
): TtsJobListQuery {
  return ttsJobListQuerySchema.parse({
    ...current,
    ...patch,
    page: 1,
  });
}
