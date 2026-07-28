/** TTS 작업 항목 URL 검색값을 공개 query 계약으로 정규화한다 */
import {
  ttsJobItemsQuerySchema,
  type TtsJobItemsQuery,
} from '@flex-thia/contracts';

/** route search를 strict TTS 작업 항목 검색값으로 변환한다 */
export function parseTtsJobItemsSearch(value: unknown): TtsJobItemsQuery {
  return ttsJobItemsQuerySchema.parse(value);
}
