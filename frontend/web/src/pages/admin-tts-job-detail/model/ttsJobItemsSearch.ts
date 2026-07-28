/** TTS 작업 항목 URL 검색값을 공개 query 계약으로 정규화한다 */
import {
  ttsJobItemsQuerySchema,
  type TtsJobItemsQuery,
} from '@flex-thia/contracts';

/** route와 상세 화면이 공유하는 TTS item 검색값 */
export type TtsJobItemsSearch = TtsJobItemsQuery;

/** route search를 strict TTS 작업 항목 검색값으로 변환한다 */
export function parseTtsJobItemsSearch(value: unknown): TtsJobItemsSearch {
  return ttsJobItemsQuerySchema.parse(value);
}

/** 항목 filter patch를 반영하고 첫 page로 돌아간다 */
export function updateTtsJobItemsSearch(
  current: TtsJobItemsSearch,
  patch: Partial<TtsJobItemsSearch>,
): TtsJobItemsSearch {
  return parseTtsJobItemsSearch(
    Object.fromEntries(
      Object.entries({ ...current, ...patch, page: 1 }).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  );
}
