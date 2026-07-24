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

  constructor(
    private readonly inspections = new Map<string, MediaAssetInspection>(),
  ) {}

  /** exact key와 MIME을 드러내는 고정 local upload form을 반환한다 */
  createUpload(
    input: Parameters<AudioUploadStorage['createUpload']>[0],
  ): Promise<Awaited<ReturnType<AudioUploadStorage['createUpload']>>> {
    this.uploads.push({ ...input });
    return Promise.resolve({
      url: 'https://fake-audio-upload.invalid',
      fields: {
        key: input.storageKey,
        'Content-Type': input.mimeType,
      },
      expiresAt: new Date(600_000).toISOString(),
    });
  }

  /** 설정되지 않은 object는 공급자 상세 없는 stable 오류로 거절한다 */
  inspect(
    storageKey: string,
  ): Promise<Awaited<ReturnType<AudioUploadStorage['inspect']>>> {
    const inspection = this.inspections.get(storageKey);
    return inspection
      ? Promise.resolve({ ...inspection })
      : Promise.reject(new AudioUploadStorageError());
  }
}
