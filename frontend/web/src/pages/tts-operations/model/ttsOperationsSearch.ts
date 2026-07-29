/** TTS 작업 URL 검색값을 공개 query 계약으로 정규화한다 */
import {
  ttsJobListQuerySchema,
  type TtsJobListQuery,
} from '@flex-thia/contracts';

/** route와 운영 화면이 공유하는 TTS 작업 검색값 */
export type TtsOperationsSearch = TtsJobListQuery;

/** route search를 strict TTS 작업 검색값으로 변환한다 */
export function parseTtsOperationsSearch(value: unknown): TtsOperationsSearch {
  return ttsJobListQuerySchema.parse(value);
}

/** filter patch 뒤 첫 page로 돌아가고 빈 값을 제거한다 */
export function updateTtsOperationsSearch(
  current: TtsOperationsSearch,
  patch: Partial<TtsOperationsSearch>,
): TtsOperationsSearch {
  return parseTtsOperationsSearch(
    Object.fromEntries(
      Object.entries({ ...current, ...patch, page: 1 }).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  );
}

/** 페이지 외 작업 필터 적용 여부를 반환한다 */
export function hasTtsOperationsFilters(search: TtsOperationsSearch) {
  return [search.status, search.from, search.to].some(
    (value) => value !== undefined,
  );
}
