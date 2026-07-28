/** TTS preset create/version/enabled command를 strict 계약으로 전송한다 */
import {
  changeTtsVoicePresetEnabledRequestSchema,
  createTtsVoicePresetRequestSchema,
  createTtsVoicePresetVersionRequestSchema,
  ttsVoicePresetDetailResponseSchema,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 최초 TTS preset version을 생성한다 */
export function createTtsPreset(body: unknown) {
  return authenticatedRequest({
    method: 'POST',
    path: '/admin/tts/presets',
    body: createTtsVoicePresetRequestSchema.parse(body),
    response: { kind: 'json', schema: ttsVoicePresetDetailResponseSchema },
  });
}

/** 같은 이름의 새 TTS preset version을 생성한다 */
export function createTtsPresetVersion(presetId: string, body: unknown) {
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/tts/presets/${presetId}/versions`,
    body: createTtsVoicePresetVersionRequestSchema.parse(body),
    response: { kind: 'json', schema: ttsVoicePresetDetailResponseSchema },
  });
}

/** TTS preset enabled 상태를 optimistic revision으로 바꾼다 */
export function changeTtsPresetEnabled(
  presetId: string,
  enabled: boolean,
  body: unknown,
) {
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/tts/presets/${presetId}/${enabled ? 'enable' : 'disable'}`,
    body: changeTtsVoicePresetEnabledRequestSchema.parse(body),
    response: { kind: 'json', schema: ttsVoicePresetDetailResponseSchema },
  });
}
