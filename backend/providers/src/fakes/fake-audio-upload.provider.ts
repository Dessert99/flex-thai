/** S3 없이 deterministic audio form과 설정된 inspection을 제공한다 */
import type {
  AudioUploadStorage,
  MediaAssetInspection,
} from '@flex-thia/domain';
import { AudioUploadStorageError } from '@flex-thia/domain';

/** 로컬·테스트가 exact upload 요청과 object inspection을 제어하는 fake */
export class FakeAudioUploadProvider implements AudioUploadStorage {
  readonly uploads: Array<Parameters<AudioUploadStorage['createUpload']>[0]> =
    [];
  readonly seals: Array<Parameters<AudioUploadStorage['inspectAndSeal']>[0]> =
    [];

  constructor(
    private readonly inspections = new Map<string, MediaAssetInspection>(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 선언 metadata를 기억하고 exact key·MIME의 local upload form을 반환한다 */
  createUpload(
    input: Parameters<AudioUploadStorage['createUpload']>[0],
  ): Promise<Awaited<ReturnType<AudioUploadStorage['createUpload']>>> {
    this.uploads.push({ ...input });
    if (!this.inspections.has(input.storageKey)) {
      this.inspections.set(input.storageKey, {
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
      });
    }
    return Promise.resolve({
      url: 'http://localhost/__fake_audio_upload__',
      fields: {
        key: input.storageKey,
        'Content-Type': input.mimeType,
      },
      expiresAt: new Date(this.now().getTime() + 600_000).toISOString(),
    });
  }

  /** 설정되지 않은 object는 공급자 상세 없는 stable 오류로 거절한다 */
  inspectAndSeal(
    input: Parameters<AudioUploadStorage['inspectAndSeal']>[0],
  ): Promise<Awaited<ReturnType<AudioUploadStorage['inspectAndSeal']>>> {
    this.seals.push({ ...input });
    const inspection = this.inspections.get(input.temporaryStorageKey);
    return inspection
      ? Promise.resolve({ ...inspection })
      : Promise.reject(new AudioUploadStorageError());
  }
}
