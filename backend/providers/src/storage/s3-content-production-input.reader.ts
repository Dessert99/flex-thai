/** 검증된 S3 콘텐츠 제작 object를 exact key·size로 읽는다 */
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { ContentProductionInputReader } from '@flex-thia/domain';

/** input snapshot 밖의 key를 만들지 않고 bytes를 공개 경계 밖에서 유지한다 */
export class S3ContentProductionInputReader implements ContentProductionInputReader {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
  ) {}

  /** S3 body와 검증된 size가 모두 일치할 때만 bytes를 반환한다 */
  async read(
    input: Parameters<ContentProductionInputReader['read']>[0],
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: input.inputKey,
      }),
      { abortSignal: signal },
    );

    if (!object.Body) {
      throw new Error('CONTENT_INPUT_BODY_MISSING');
    }
    const bytes = await object.Body.transformToByteArray();

    if (bytes.byteLength !== input.sizeBytes) {
      throw new Error('CONTENT_INPUT_SIZE_MISMATCH');
    }
    return bytes;
  }
}
