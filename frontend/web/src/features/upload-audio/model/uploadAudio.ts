/** 음성 파일 한 개를 검증·업로드·완료하는 순차 상태 기계를 정의한다 */
import {
  audioUploadRequestSchema,
  type AudioUploadRequest,
} from '@flex-thia/contracts';
import {
  completeMediaAsset,
  postPresignedAudio,
  requestAudioUpload,
} from '../api/mediaAssetApi';
import { computeSha256 } from '../lib/computeSha256';

/** 접근 가능한 음성 업로드 진행과 복구 상태 */
export type AudioUploadProgress =
  | { status: 'idle' }
  | { status: 'hashing' }
  | { status: 'uploading'; percent: number }
  | { status: 'completing' }
  | { status: 'ready'; mediaAssetId: string }
  | { status: 'error'; message: string; requestId?: string };

/** owning form에 전달할 수 있는 확정된 음성 자산 */
export type ReadyAudioAsset = { mediaAssetId: string; status: 'READY' };

type ProgressListener = (progress: AudioUploadProgress) => void;

/** File metadata와 digest를 공개 업로드 요청 계약으로 제한한다 */
export function createAudioUploadRequest(
  file: File,
  sha256: string,
): AudioUploadRequest {
  return audioUploadRequestSchema.parse({
    filename: file.name,
    mimeType: file.type,
    sha256,
    sizeBytes: file.size,
  });
}

/** presigned 업로드를 순서대로 실행하고 완료 검증 뒤에만 READY를 반환한다 */
export async function uploadAudio(
  file: File,
  signal: AbortSignal,
  onProgress: ProgressListener = () => undefined,
): Promise<ReadyAudioAsset> {
  signal.throwIfAborted();
  onProgress({ status: 'hashing' });
  const request = createAudioUploadRequest(file, await computeSha256(file));
  signal.throwIfAborted();
  const prepared = await requestAudioUpload(request, signal);

  if (!prepared.uploadRequired) {
    const ready = {
      mediaAssetId: prepared.mediaAssetId,
      status: 'READY',
    } as const;
    onProgress({ status: 'ready', mediaAssetId: ready.mediaAssetId });
    return ready;
  }

  onProgress({ status: 'uploading', percent: 0 });
  await postPresignedAudio(
    prepared.upload.url,
    prepared.upload.fields,
    file,
    signal,
  );
  onProgress({ status: 'uploading', percent: 100 });
  onProgress({ status: 'completing' });
  const completed = await completeMediaAsset(prepared.mediaAssetId, signal);
  const ready = {
    mediaAssetId: completed.mediaAssetId,
    status: completed.status,
  } as const;
  onProgress({ status: 'ready', mediaAssetId: ready.mediaAssetId });
  return ready;
}
