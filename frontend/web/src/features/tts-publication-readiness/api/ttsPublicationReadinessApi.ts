/** 문제 version의 TTS 게시 readiness query를 정의한다 */
import { ttsPublicationReadinessResponseSchema } from '@flex-thia/contracts';
import { queryOptions } from '@tanstack/react-query';
import { authenticatedRequest } from '@/shared/api';

/** DRAFT 문제 version에 필요한 모든 음성의 준비 상태를 조회한다 */
export function ttsPublicationReadinessQueryOptions(
  questionId: string,
  versionId: string,
) {
  return queryOptions({
    queryKey: ['admin', 'tts', 'readiness', questionId, versionId] as const,
    queryFn: () =>
      authenticatedRequest({
        path: `/admin/tts/questions/${questionId}/versions/${versionId}/readiness`,
        response: {
          kind: 'json',
          schema: ttsPublicationReadinessResponseSchema,
        },
      }),
  });
}
