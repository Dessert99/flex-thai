/** 준비된 음성 파일의 변경 불가능한 수명 규칙을 정의한다 */
export type MediaAssetStatus = 'UPLOADING' | 'READY' | 'REJECTED';

/** private storage의 음성 object와 서버 검증 결과 */
export interface MediaAsset {
  id: string;
  kind: 'AUDIO';
  storageKey: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
  declaredSha256: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  status: MediaAssetStatus;
  readyAt: Date | null;
}

/** storage object를 서버가 다시 확인한 결과 */
export interface MediaAssetInspection {
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

/** 음성 수명 규칙 위반을 안정적인 code로 전달한다 */
export class MediaAssetDomainError extends Error {
  constructor(
    readonly code:
      | 'MEDIA_ASSET_IMMUTABLE'
      | 'MEDIA_ASSET_NOT_UPLOADING'
      | 'MEDIA_ASSET_NOT_READY'
      | 'MEDIA_INSPECTION_MISMATCH',
  ) {
    super(code);
    this.name = 'MediaAssetDomainError';
  }
}

const assertUploading = (asset: MediaAsset): void => {
  if (asset.status === 'READY') {
    throw new MediaAssetDomainError('MEDIA_ASSET_IMMUTABLE');
  }
  if (asset.status !== 'UPLOADING') {
    throw new MediaAssetDomainError('MEDIA_ASSET_NOT_UPLOADING');
  }
};

/** 선언 정보와 실제 object가 일치할 때만 음성을 READY로 전이한다 */
export const completeMediaAsset = (
  asset: MediaAsset,
  inspection: MediaAssetInspection,
  readyAt: Date,
): MediaAsset => {
  assertUploading(asset);
  if (
    asset.declaredMimeType !== inspection.mimeType ||
    asset.declaredSizeBytes !== inspection.sizeBytes ||
    asset.declaredSha256.toLowerCase() !== inspection.sha256.toLowerCase()
  ) {
    throw new MediaAssetDomainError('MEDIA_INSPECTION_MISMATCH');
  }
  return {
    ...asset,
    mimeType: inspection.mimeType,
    sizeBytes: inspection.sizeBytes,
    sha256: inspection.sha256.toLowerCase(),
    status: 'READY',
    readyAt,
  };
};

/** 완료 검증에 실패한 업로드를 다시 게시 후보로 쓰지 못하게 종료한다 */
export const rejectMediaAsset = (asset: MediaAsset): MediaAsset => {
  assertUploading(asset);
  return { ...asset, status: 'REJECTED' };
};

/** 게시 규칙이 검증된 READY 음성만 참조하게 한다 */
export const assertMediaAssetReady = (asset: MediaAsset): void => {
  if (asset.status !== 'READY') {
    throw new MediaAssetDomainError('MEDIA_ASSET_NOT_READY');
  }
};
