/** TTS preset 목록·상세 strict Query 옵션을 정의한다 */
import {
  ttsVoicePresetDetailResponseSchema,
  ttsVoicePresetListResponseSchema,
  type TtsVoicePresetListQuery,
} from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';
import { serializeTtsPresetSearch } from '../model/ttsPresetSearch';

/** TTS preset page 검색값별 Query 옵션을 만든다 */
export function ttsPresetListQueryOptions(search: TtsVoicePresetListQuery) {
  return queryOptions({
    queryKey: ['admin', 'tts', 'presets', search] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/tts/presets?${serializeTtsPresetSearch(search)}`,
        response: { kind: 'json', schema: ttsVoicePresetListResponseSchema },
        signal,
      }),
  });
}

/** TTS preset UUID 상세 Query 옵션을 만든다 */
export function ttsPresetDetailQueryOptions(presetId: string) {
  return queryOptions({
    queryKey: ['admin', 'tts', 'presets', 'detail', presetId] as const,
    queryFn: ({ signal }) =>
      authenticatedRequest({
        path: `/admin/tts/presets/${presetId}`,
        response: { kind: 'json', schema: ttsVoicePresetDetailResponseSchema },
        signal,
      }),
  });
}
