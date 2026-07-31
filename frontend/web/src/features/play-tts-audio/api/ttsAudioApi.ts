/** TTS 항목의 click-time audio URL을 strict 응답으로 요청한다 */
import { ttsItemAudioResponseSchema } from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 성공 TTS 항목의 짧은 만료 read URL을 발급한다 */
export function getTtsItemAudio(itemId: string) {
  return authenticatedRequest({
    path: `/admin/tts/items/${itemId}/audio`,
    response: { kind: 'json', schema: ttsItemAudioResponseSchema },
  });
}
