/** S3 없이 presigned policy와 object 검사 결과를 제공한다 */
import type {
  UploadInspection,
  UploadPolicy,
  UploadStorage,
} from '@flex-thia/domain';

/** 테스트가 지정한 object inspection을 반환하는 fake upload storage */
export class FakeUploadProvider implements UploadStorage {
  readonly policies: Array<{
    uploadId: string;
    objectKey: string;
    contentType: string;
  }> = [];

  constructor(
    private readonly inspections = new Map<string, UploadInspection>(),
  ) {}

  /** local 화면이 사용할 고정 URL과 exact key field를 반환한다 */
  createPolicy(input: {
    uploadId: string;
    objectKey: string;
    contentType: string;
  }): Promise<UploadPolicy> {
    this.policies.push({ ...input });
    return Promise.resolve({
      uploadId: input.uploadId,
      url: 'https://fake-upload.invalid',
      fields: {
        key: input.objectKey,
        'Content-Type': input.contentType,
      },
      expiresAt: new Date(0).toISOString(),
    });
  }

  /** 테스트가 등록하지 않은 object는 안전하게 실패한다 */
  inspectObject(objectKey: string): Promise<UploadInspection> {
    const inspection = this.inspections.get(objectKey);

    if (!inspection) {
      return Promise.reject(new Error(`object 검사가 없습니다: ${objectKey}`));
    }

    return Promise.resolve(inspection);
  }
}
