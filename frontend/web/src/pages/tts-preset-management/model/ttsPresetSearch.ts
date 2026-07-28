/** TTS preset URL 검색값을 공개 query 계약으로 정규화·직렬화한다 */
import {
  ttsVoicePresetListQuerySchema,
  type TtsVoicePresetListQuery,
} from '@flex-thia/contracts';

/** route search를 strict TTS preset 검색값으로 변환한다 */
export function parseTtsPresetSearch(value: unknown): TtsVoicePresetListQuery {
  return ttsVoicePresetListQuerySchema.parse(value);
}

/** API가 기대하는 안정 순서로 TTS preset query를 직렬화한다 */
export function serializeTtsPresetSearch(
  search: TtsVoicePresetListQuery,
): string {
  const query = new URLSearchParams();
  (['query', 'enabled', 'page', 'pageSize'] as const).forEach((key) => {
    const value = search[key];
    if (value !== undefined) query.set(key, String(value));
  });
  return query.toString();
}
