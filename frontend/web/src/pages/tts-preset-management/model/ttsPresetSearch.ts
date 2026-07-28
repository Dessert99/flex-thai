/** TTS preset URL 검색값을 공개 query 계약으로 정규화·직렬화한다 */
import {
  ttsVoicePresetListQuerySchema,
  type TtsVoicePresetListQuery,
} from '@flex-thia/contracts';

/** route와 관리 화면이 공유하는 TTS preset 검색값 */
export type TtsPresetSearch = TtsVoicePresetListQuery;

/** route search를 strict TTS preset 검색값으로 변환한다 */
export function parseTtsPresetSearch(value: unknown): TtsPresetSearch {
  return ttsVoicePresetListQuerySchema.parse(value);
}

/** filter patch를 반영하고 첫 page로 돌아간다 */
export function updateTtsPresetSearch(
  current: TtsPresetSearch,
  patch: Partial<TtsPresetSearch>,
): TtsPresetSearch {
  return parseTtsPresetSearch(
    Object.fromEntries(
      Object.entries({ ...current, ...patch, page: 1 }).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  );
}

/** page 외 preset filter 적용 여부를 반환한다 */
export function hasTtsPresetFilters(search: TtsPresetSearch) {
  return search.query !== undefined || search.enabled !== undefined;
}

/** API가 기대하는 안정 순서로 TTS preset query를 직렬화한다 */
export function serializeTtsPresetSearch(search: TtsPresetSearch): string {
  const query = new URLSearchParams();
  (['query', 'enabled', 'page', 'pageSize'] as const).forEach((key) => {
    const value = search[key];
    if (value !== undefined) query.set(key, String(value));
  });
  return query.toString();
}
