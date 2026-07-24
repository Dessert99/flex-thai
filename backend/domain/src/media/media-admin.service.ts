/** 관리자 audio upload 요청과 실제 object 완료 검증을 조율한다 */
import { randomUUID } from 'node:crypto';
import type {
  AudioMimeType,
  AudioUploadForm,
  AudioUploadStorage,
  MediaAdminRepository,
  MediaAssetAuditContext,
} from './media-admin.repository.js';
import {
  MediaAssetDomainError,
  type ReadyMediaAsset,
  type UploadingMediaAsset,
} from './media-asset.js';

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const AUDIO_MIME_TYPES: readonly string[] = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
];

/** 관리자 audio upload 선언과 audit 문맥 */
export interface RequestAudioUploadCommand {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  context: MediaAssetAuditContext;
}

/** 새 upload form과 READY exact 재사용을 구분한 도메인 결과 */
export type RequestAudioUploadResult =
  | {
      mediaAssetId: string;
      status: 'UPLOADING';
      uploadRequired: true;
      upload: AudioUploadForm;
    }
  | {
      mediaAssetId: string;
      status: 'READY';
      uploadRequired: false;
      reused: true;
    };

const assertAudioDeclaration: (
  command: RequestAudioUploadCommand,
) => asserts command is RequestAudioUploadCommand & {
  mimeType: AudioMimeType;
} = (command) => {
  if (command.sizeBytes < 1) {
    throw new MediaAssetDomainError('MEDIA_UPLOAD_EMPTY');
  }
  if (
    !Number.isSafeInteger(command.sizeBytes) ||
    command.sizeBytes > MAX_AUDIO_SIZE_BYTES
  ) {
    throw new MediaAssetDomainError('MEDIA_UPLOAD_TOO_LARGE');
  }
  if (!AUDIO_MIME_TYPES.includes(command.mimeType)) {
    throw new MediaAssetDomainError('MEDIA_MIME_NOT_ALLOWED');
  }
  if (!SHA256_PATTERN.test(command.sha256)) {
    throw new MediaAssetDomainError('MEDIA_SHA256_INVALID');
  }
};

/** exact READY 재사용과 immutable terminal 전이를 수행하는 관리자 use case */
export class MediaAdminService {
  constructor(
    private readonly repository: MediaAdminRepository,
    private readonly storage: AudioUploadStorage,
    private readonly generateMediaAssetId: () => string = randomUUID,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 선언값을 먼저 검증하고 서버가 정한 exact key의 upload만 준비한다 */
  async requestAudioUpload(
    command: RequestAudioUploadCommand,
  ): Promise<RequestAudioUploadResult> {
    assertAudioDeclaration(command);
    const mediaAssetId = this.generateMediaAssetId();
    if (!UUID_PATTERN.test(mediaAssetId)) {
      throw new MediaAssetDomainError('MEDIA_ASSET_ID_INVALID');
    }
    const normalizedSha256 = command.sha256.toLowerCase();
    const reusable = await this.repository.findReadyByMetadata({
      mimeType: command.mimeType,
      sizeBytes: command.sizeBytes,
      sha256: normalizedSha256,
    });

    if (reusable) {
      return {
        mediaAssetId: reusable.id,
        status: 'READY',
        uploadRequired: false,
        reused: true,
      };
    }

    const storageKey = `audio/${mediaAssetId}`;
    const temporaryStorageKey = `audio/uploads/${mediaAssetId}`;
    const asset: UploadingMediaAsset = {
      id: mediaAssetId,
      kind: 'AUDIO',
      storageKey,
      declaredMimeType: command.mimeType,
      declaredSizeBytes: command.sizeBytes,
      declaredSha256: normalizedSha256,
      mimeType: null,
      sizeBytes: null,
      sha256: null,
      status: 'UPLOADING',
      readyAt: null,
    };
    const upload = await this.storage.createUpload({
      mediaAssetId,
      storageKey: temporaryStorageKey,
      mimeType: command.mimeType,
      sizeBytes: command.sizeBytes,
      sha256: normalizedSha256,
    });
    await this.repository.createUploadingWithAudit({
      asset,
      context: command.context,
    });
    return {
      mediaAssetId,
      status: 'UPLOADING',
      uploadRequired: true,
      upload,
    };
  }

  /** 외부 검사는 transaction 전에 끝내고 lock 안에서 상태를 다시 판정한다 */
  async completeAudioUpload(
    mediaAssetId: string,
    context: MediaAssetAuditContext,
  ): Promise<ReadyMediaAsset> {
    const asset = await this.repository.findById(mediaAssetId);
    if (!asset) {
      throw new MediaAssetDomainError('MEDIA_ASSET_NOT_FOUND');
    }
    if (asset.status === 'READY') {
      return asset;
    }
    if (asset.status !== 'UPLOADING') {
      throw new MediaAssetDomainError('MEDIA_ASSET_NOT_UPLOADING');
    }

    const inspection = await this.storage.inspectAndSeal({
      temporaryStorageKey: `audio/uploads/${asset.id}`,
      finalStorageKey: asset.storageKey,
    });
    const finalization = await this.repository.finalizeWithAudit({
      mediaAssetId,
      inspection,
      readyAt: this.now(),
      context,
    });
    if (!finalization) {
      throw new MediaAssetDomainError('MEDIA_ASSET_NOT_FOUND');
    }
    if (finalization.outcome === 'REJECTED') {
      // REJECTED와 audit transaction이 resolve된 뒤 stable mismatch를 전달한다.
      throw new MediaAssetDomainError('MEDIA_INSPECTION_MISMATCH');
    }
    return finalization.asset;
  }
}
