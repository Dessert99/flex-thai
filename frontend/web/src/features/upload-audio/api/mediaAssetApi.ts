/** 관리자 media asset 인증 API와 presigned form 전송 경계를 분리한다 */
import {
  audioUploadRequestSchema,
  audioUploadResponseSchema,
  completeMediaAssetResponseSchema,
  mediaAssetDetailResponseSchema,
  mediaAssetIdPathSchema,
  type AudioUploadRequest,
  type AudioUploadResponse,
} from '@flex-thia/contracts';
import { authenticatedRequest } from '@/shared/api';

/** 검증된 음성 metadata로 presigned form 또는 READY 재사용을 요청한다 */
export function requestAudioUpload(
  request: AudioUploadRequest,
  signal: AbortSignal,
): Promise<AudioUploadResponse> {
  return authenticatedRequest({
    body: audioUploadRequestSchema.parse(request),
    method: 'POST',
    path: '/admin/media-assets/audio-upload-requests',
    response: { kind: 'json', schema: audioUploadResponseSchema },
    signal,
  });
}

/** presigned 값만 담은 form을 인증 header 없이 60초 안에 전송한다 */
export async function postPresignedAudio(
  url: string,
  fields: Record<string, string>,
  file: File,
  signal: AbortSignal,
): Promise<void> {
  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => timeoutController.abort(),
    60_000,
  );
  const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  form.append('file', file);

  try {
    const response = await fetch(url, {
      body: form,
      method: 'POST',
      signal: combinedSignal,
    });
    if (!response.ok) {
      throw new Error('S3 음성 전송에 실패했습니다.');
    }
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/** S3 객체 검증이 끝난 뒤에만 media asset을 READY로 확정한다 */
export function completeMediaAsset(mediaAssetId: string, signal: AbortSignal) {
  const path = mediaAssetIdPathSchema.parse({ mediaAssetId });
  return authenticatedRequest({
    method: 'POST',
    path: `/admin/media-assets/${path.mediaAssetId}/complete`,
    response: { kind: 'json', schema: completeMediaAssetResponseSchema },
    signal,
  });
}

/** 기존 media asset의 공개 상태를 한 번 조회해 복구 화면에 제공한다 */
export function getMediaAsset(mediaAssetId: string) {
  const path = mediaAssetIdPathSchema.parse({ mediaAssetId });
  return authenticatedRequest({
    path: `/admin/media-assets/${path.mediaAssetId}`,
    response: { kind: 'json', schema: mediaAssetDetailResponseSchema },
  });
}
