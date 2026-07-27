/** 검증된 S3 콘텐츠 제작 object를 exact key·size로 읽는다 */
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { ContentProductionInputReader } from '@flex-thia/domain';

type BoundedS3Body = AsyncIterable<Uint8Array> & {
  destroy?: () => void;
};

const readBounded = async (
  body: BoundedS3Body,
  expectedSize: number,
  signal: AbortSignal,
): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stop = () => body.destroy?.();
  signal.addEventListener('abort', stop, { once: true });

  try {
    if (signal.aborted) {
      stop();
      throw signal.reason;
    }
    for await (const chunk of body) {
      if (signal.aborted) {
        stop();
        throw signal.reason;
      }
      if (total + chunk.byteLength > expectedSize) {
        stop();
        throw new Error('CONTENT_INPUT_SIZE_MISMATCH');
      }
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    signal.removeEventListener('abort', stop);
  }

  if (total !== expectedSize) {
    throw new Error('CONTENT_INPUT_SIZE_MISMATCH');
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

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
    const body = object.Body as unknown as BoundedS3Body;
    if (typeof body[Symbol.asyncIterator] !== 'function') {
      throw new Error('CONTENT_INPUT_STREAM_UNSUPPORTED');
    }
    return readBounded(body, input.sizeBytes, signal);
  }
}
