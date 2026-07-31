/** 선택한 TTS 실패 항목을 strict durable retry endpoint로 전송한다 */
import {
  retryTtsJobRequestSchema,
  ttsRetryResponseSchema,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 현재 attempt snapshot을 포함한 TTS batch retry를 요청한다 */
export function retryTtsItems(
  jobId: string,
  items: Array<{ itemId: string; expectedAttempt: number }>,
) {
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/tts/jobs/${jobId}/retry`,
    body: retryTtsJobRequestSchema.parse({ items }),
    response: { kind: 'json', schema: ttsRetryResponseSchema },
  });
}
