/** S3 없이 presigned policy와 object 검사 결과를 제공한다 */
import type {
  InputType,
  UploadInspection,
  UploadPolicy,
  UploadStorage,
} from '@flex-thia/domain';

/** 선언 metadata 또는 테스트 fixture로 object 검사를 재현하는 local storage */
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
    inputType: InputType;
    contentType: string;
    declaredSizeBytes: number;
  }): Promise<UploadPolicy> {
    this.policies.push({
      uploadId: input.uploadId,
      objectKey: input.objectKey,
      contentType: input.contentType,
    });
    if (!this.inspections.has(input.objectKey)) {
      this.inspections.set(input.objectKey, {
        sizeBytes: input.declaredSizeBytes,
        contentType: input.contentType,
        detectedType: input.inputType,
        encryptedPdf: false,
        pdfPageCount: input.inputType === 'PDF' ? 1 : null,
      });
    }
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

  /** 정책 발급이나 테스트 fixture가 준비하지 않은 object는 안전하게 실패한다 */
  inspectObject(objectKey: string): Promise<UploadInspection> {
    const inspection = this.inspections.get(objectKey);

    if (!inspection) {
      return Promise.reject(new Error(`object 검사가 없습니다: ${objectKey}`));
    }

    return Promise.resolve(inspection);
  }
}
