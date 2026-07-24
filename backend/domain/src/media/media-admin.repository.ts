/** 관리자 음성 업로드가 요구하는 저장·storage transaction port를 정의한다 */
import type {
  MediaAsset,
  MediaAssetInspection,
  ReadyMediaAsset,
  RejectedMediaAsset,
  UploadingMediaAsset,
} from './media-asset.js';

/** 서버와 S3 policy가 함께 허용하는 음성 MIME */
export type AudioMimeType =
  'audio/mpeg' | 'audio/wav' | 'audio/ogg' | 'audio/webm' | 'audio/mp4';

/** 관리자 변경 audit에 필요한 인증·요청 문맥 */
export interface MediaAssetAuditContext {
  actorSub: string;
  actorUserId: string | null;
  requestId: string;
}

/** 브라우저가 private audio object를 직접 올릴 POST form */
export interface AudioUploadForm {
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}

/** 외부 object 검사를 DB transaction 밖에서 수행하는 audio storage port */
export interface AudioUploadStorage {
  createUpload(input: {
    mediaAssetId: string;
    storageKey: string;
    mimeType: AudioMimeType;
    sizeBytes: number;
  }): Promise<AudioUploadForm>;
  inspect(storageKey: string): Promise<MediaAssetInspection>;
}

/** 공급자 상세를 감춘 audio storage stable 오류 */
export class AudioUploadStorageError extends Error {
  readonly code = 'AUDIO_UPLOAD_STORAGE_FAILED';

  constructor() {
    super('AUDIO_UPLOAD_STORAGE_FAILED');
    this.name = 'AudioUploadStorageError';
  }
}

/** lock 뒤 결정된 terminal 전이 또는 READY 멱등 결과 */
export type MediaAssetFinalization =
  | {
      outcome: 'READY' | 'READY_UNCHANGED';
      asset: ReadyMediaAsset;
    }
  | {
      outcome: 'REJECTED';
      asset: RejectedMediaAsset;
    };

/** media row 변경과 audit을 동일 transaction으로 보장하는 저장 port */
export interface MediaAdminRepository {
  findReadyByMetadata(input: {
    mimeType: AudioMimeType;
    sizeBytes: number;
    sha256: string;
  }): Promise<ReadyMediaAsset | null>;
  createUploadingWithAudit(input: {
    asset: UploadingMediaAsset;
    context: MediaAssetAuditContext;
  }): Promise<void>;
  findById(mediaAssetId: string): Promise<MediaAsset | null>;
  finalizeWithAudit(input: {
    mediaAssetId: string;
    inspection: MediaAssetInspection;
    readyAt: Date;
    context: MediaAssetAuditContext;
  }): Promise<MediaAssetFinalization | null>;
}
