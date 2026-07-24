/** private audio S3의 exact presigned POST와 실제 SHA-256 검사를 구현한다 */
import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
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

interface PinnedObject {
  bytes: Uint8Array;
  inspection: Awaited<ReturnType<AudioUploadStorage['inspectAndSeal']>>;
  versionId?: string;
}

const isDestinationConflict = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === 'PreconditionFailed' ||
    candidate.name === 'ConditionalRequestConflict' ||
    candidate.$metadata?.httpStatusCode === 409 ||
    candidate.$metadata?.httpStatusCode === 412
  );
};

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

  /** pinned temp bytes를 final key에 write-once로 seal하고 그 뒤에만 temp를 지운다 */
  async inspectAndSeal(
    input: Parameters<AudioUploadStorage['inspectAndSeal']>[0],
  ): Promise<Awaited<ReturnType<AudioUploadStorage['inspectAndSeal']>>> {
    try {
      const temporary = await this.readPinnedObject(input.temporaryStorageKey);
      let inspection = temporary.inspection;
      try {
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: input.finalStorageKey,
            Body: temporary.bytes,
            ContentType: temporary.inspection.mimeType,
            ChecksumSHA256: createHash('sha256')
              .update(temporary.bytes)
              .digest('base64'),
            IfNoneMatch: '*',
          }),
        );
      } catch (error) {
        if (!isDestinationConflict(error)) throw error;
        // retry는 기존 final object를 pinned read해 overwrite 없이 같은 검증 경로로 보낸다.
        inspection = (await this.readPinnedObject(input.finalStorageKey))
          .inspection;
      }
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: input.temporaryStorageKey,
          ...(temporary.versionId ? { VersionId: temporary.versionId } : {}),
        }),
      );
      return inspection;
    } catch {
      throw new AudioUploadStorageError();
    }
  }

  private async readPinnedObject(storageKey: string): Promise<PinnedObject> {
    const head = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      }),
    );
    if (head.ContentLength === undefined || !head.ContentType || !head.ETag) {
      throw new AudioUploadStorageError();
    }
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
        IfMatch: head.ETag,
        ...(head.VersionId ? { VersionId: head.VersionId } : {}),
      }),
    );
    if (!object.Body) {
      throw new AudioUploadStorageError();
    }
    const bytes = await object.Body.transformToByteArray();
    if (bytes.byteLength !== head.ContentLength) {
      throw new AudioUploadStorageError();
    }
    return {
      bytes,
      inspection: {
        mimeType: head.ContentType,
        sizeBytes: head.ContentLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      ...(head.VersionId ? { versionId: head.VersionId } : {}),
    };
  }
}
