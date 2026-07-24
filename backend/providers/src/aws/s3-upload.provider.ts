/** private Input S3의 presigned POST와 실제 object 검사를 구현한다 */
import {
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  createPresignedPost,
  type PresignedPostOptions,
} from '@aws-sdk/s3-presigned-post';
import type {
  InputType,
  UploadInspection,
  UploadPolicy,
  UploadStorage,
} from '@flex-thia/domain';
import { PDFDocument } from 'pdf-lib';

type PresignedPostSigner = (
  client: S3Client,
  options: PresignedPostOptions,
) => ReturnType<typeof createPresignedPost>;

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((value, index) => bytes[index] === value);

const detectImage = (bytes: Uint8Array): boolean =>
  startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) ||
  startsWith(bytes, [0xff, 0xd8, 0xff]) ||
  (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP');

const detectText = (bytes: Uint8Array): boolean => {
  try {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return !value.includes('\u0000');
  } catch {
    return false;
  }
};

/** S3가 key·MIME·25MB를 강제하고 서버가 실제 bytes를 재검사하는 adapter */
export class S3UploadProvider implements UploadStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
    private readonly sign: PresignedPostSigner = createPresignedPost,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 10분 동안 exact key·content type·최대 25MB만 허용한다 */
  async createPolicy(input: {
    uploadId: string;
    objectKey: string;
    contentType: string;
  }): Promise<UploadPolicy> {
    const expiresIn = 600;
    const result = await this.sign(this.client, {
      Bucket: this.bucketName,
      Key: input.objectKey,
      Expires: expiresIn,
      Fields: { 'Content-Type': input.contentType },
      Conditions: [
        ['content-length-range', 1, 25 * 1024 * 1024],
        ['eq', '$key', input.objectKey],
        ['eq', '$Content-Type', input.contentType],
      ],
    });
    return {
      uploadId: input.uploadId,
      ...result,
      expiresAt: new Date(
        this.now().getTime() + expiresIn * 1000,
      ).toISOString(),
    };
  }

  /** Head metadata와 전체 bytes의 signature·PDF encryption·페이지 수를 검사한다 */
  async inspectObject(objectKey: string): Promise<UploadInspection> {
    const head = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      }),
    );
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      }),
    );

    if (head.ContentLength === undefined || !head.ContentType || !object.Body) {
      throw new Error('S3 object metadata가 완전하지 않습니다');
    }

    const bytes = await object.Body.transformToByteArray();

    if (bytes.byteLength !== head.ContentLength) {
      throw new Error('S3 object 크기와 읽은 bytes가 일치하지 않습니다');
    }

    const detected = await this.detectType(bytes);
    return {
      sizeBytes: head.ContentLength,
      contentType: head.ContentType,
      ...detected,
    };
  }

  private async detectType(bytes: Uint8Array): Promise<{
    detectedType: InputType | 'UNKNOWN';
    encryptedPdf: boolean;
    pdfPageCount: number | null;
  }> {
    if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
      try {
        const document = await PDFDocument.load(bytes);
        return {
          detectedType: 'PDF',
          encryptedPdf: false,
          pdfPageCount: document.getPageCount(),
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.toLowerCase().includes('encrypted')
        ) {
          return {
            detectedType: 'PDF',
            encryptedPdf: true,
            pdfPageCount: null,
          };
        }

        throw error;
      }
    }

    if (detectImage(bytes)) {
      return {
        detectedType: 'IMAGE',
        encryptedPdf: false,
        pdfPageCount: null,
      };
    }

    if (detectText(bytes)) {
      return {
        detectedType: 'TEXT',
        encryptedPdf: false,
        pdfPageCount: null,
      };
    }

    return {
      detectedType: 'UNKNOWN',
      encryptedPdf: false,
      pdfPageCount: null,
    };
  }
}
