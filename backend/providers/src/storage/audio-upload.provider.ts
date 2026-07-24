/** private audio S3의 exact presigned POST와 실제 SHA-256 검사를 구현한다 */
import { createHash } from 'node:crypto';
import {
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  createPresignedPost,
  type PresignedPostOptions,
} from '@aws-sdk/s3-presigned-post';
import {
  AudioUploadStorageError,
  type AudioUploadStorage,
} from '@flex-thia/domain';

type PresignedPostSigner = (
  client: S3Client,
  options: PresignedPostOptions,
) => ReturnType<typeof createPresignedPost>;

/** AWS 상세를 stable 오류로 막고 전체 bytes에서 actual hash를 계산하는 adapter */
export class S3AudioUploadProvider implements AudioUploadStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
    private readonly sign: PresignedPostSigner = createPresignedPost,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 10분 동안 exact key·MIME·선언 size만 허용하는 POST form을 만든다 */
  async createUpload(
    input: Parameters<AudioUploadStorage['createUpload']>[0],
  ): Promise<Awaited<ReturnType<AudioUploadStorage['createUpload']>>> {
    const expiresIn = 600;
    try {
      const result = await this.sign(this.client, {
        Bucket: this.bucketName,
        Key: input.storageKey,
        Expires: expiresIn,
        Fields: {
          key: input.storageKey,
          'Content-Type': input.mimeType,
        },
        Conditions: [
          ['content-length-range', 1, 25 * 1024 * 1024],
          ['content-length-range', input.sizeBytes, input.sizeBytes],
          ['eq', '$key', input.storageKey],
          ['eq', '$Content-Type', input.mimeType],
        ],
      });
      return {
        ...result,
        expiresAt: new Date(
          this.now().getTime() + expiresIn * 1000,
        ).toISOString(),
      };
    } catch {
      throw new AudioUploadStorageError();
    }
  }

  /** Head MIME·size와 Get 전체 bytes를 공급자 상세 없이 actual metadata로 바꾼다 */
  async inspect(
    storageKey: string,
  ): Promise<Awaited<ReturnType<AudioUploadStorage['inspect']>>> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        }),
      );
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        }),
      );
      if (
        head.ContentLength === undefined ||
        !head.ContentType ||
        !object.Body
      ) {
        throw new AudioUploadStorageError();
      }

      const bytes = await object.Body.transformToByteArray();
      if (bytes.byteLength !== head.ContentLength) {
        throw new AudioUploadStorageError();
      }
      return {
        mimeType: head.ContentType,
        sizeBytes: head.ContentLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    } catch {
      throw new AudioUploadStorageError();
    }
  }
}
