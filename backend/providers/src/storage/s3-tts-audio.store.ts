/** production TTS WAV를 private S3 object로 불변 저장하고 GC metadata를 검증한다 */
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { TtsAudioGarbageStore, TtsAudioStore } from '@flex-thia/domain';

const storageKeyPattern =
  /^private\/tts\/runs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.wav$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;

const assertStorageKey = (storageKey: string): void => {
  if (!storageKeyPattern.test(storageKey)) {
    throw new Error('S3_TTS_AUDIO_STORAGE_KEY_INVALID');
  }
};

const isAwsError = (error: unknown, statusCode: number): boolean =>
  error !== null &&
  typeof error === 'object' &&
  '$metadata' in error &&
  (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode === statusCode;

const metadataFromHead = (
  storageKey: string,
  result: {
    ContentType?: string | undefined;
    ContentLength?: number | undefined;
    Metadata?: Record<string, string> | undefined;
  },
) => {
  const sha256 = result.Metadata?.['sha256'];
  const declaredSize = result.Metadata?.['sizebytes'];
  if (
    result.ContentType !== 'audio/wav' ||
    !Number.isSafeInteger(result.ContentLength) ||
    result.ContentLength === undefined ||
    result.ContentLength < 0 ||
    typeof sha256 !== 'string' ||
    !sha256Pattern.test(sha256) ||
    declaredSize !== String(result.ContentLength)
  ) {
    throw new Error('S3_TTS_AUDIO_METADATA_INVALID');
  }
  return {
    storageKey,
    mimeType: 'audio/wav' as const,
    sizeBytes: result.ContentLength,
    sha256,
  };
};

/** production TTS private object store 생성 입력 */
export interface CreateS3TtsAudioStoreInput {
  region: string;
  bucketName: string;
}

/** AWS client 생성도 provider 경계 안에 두고 private S3 store를 만든다 */
export const createS3TtsAudioStore = (
  input: CreateS3TtsAudioStoreInput,
): S3TtsAudioStore =>
  new S3TtsAudioStore(new S3Client({ region: input.region }), input.bucketName);

/** 조건부 put과 immutable Head metadata로 overwrite·오염을 차단한다 */
export class S3TtsAudioStore implements TtsAudioStore, TtsAudioGarbageStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
  ) {}

  /** reserved key에 WAV를 한 번만 쓰고 exact replay만 성공으로 인정한다 */
  async put(
    input: Parameters<TtsAudioStore['put']>[0],
  ): ReturnType<TtsAudioStore['put']> {
    assertStorageKey(input.storageKey);
    if (!sha256Pattern.test(input.sha256)) {
      throw new Error('S3_TTS_AUDIO_SHA256_INVALID');
    }
    if (input.signal.aborted) {
      throw new Error('S3_TTS_AUDIO_WRITE_ABORTED');
    }
    if (input.deadline.getTime() <= Date.now()) {
      throw new Error('S3_TTS_AUDIO_WRITE_DEADLINE_EXCEEDED');
    }

    const deadlineController = new AbortController();
    const timeout = setTimeout(
      () => deadlineController.abort(),
      Math.max(0, input.deadline.getTime() - Date.now()),
    );
    const signal = AbortSignal.any([input.signal, deadlineController.signal]);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: input.storageKey,
          Body: input.bytes,
          ContentType: input.mimeType,
          IfNoneMatch: '*',
          Metadata: {
            sha256: input.sha256,
            sizebytes: String(input.bytes.byteLength),
          },
        }),
        { abortSignal: signal },
      );
    } catch (error) {
      if (input.signal.aborted) {
        throw new Error('S3_TTS_AUDIO_WRITE_ABORTED');
      }
      if (deadlineController.signal.aborted) {
        throw new Error('S3_TTS_AUDIO_WRITE_DEADLINE_EXCEEDED');
      }
      if (isAwsError(error, 412)) {
        const existing = await this.inspect(input.storageKey);
        if (
          existing?.mimeType === input.mimeType &&
          existing.sizeBytes === input.bytes.byteLength &&
          existing.sha256 === input.sha256
        ) {
          return existing;
        }
        throw new Error('S3_TTS_AUDIO_IMMUTABLE_CONFLICT');
      }
      throw new Error('S3_TTS_AUDIO_WRITE_FAILED');
    } finally {
      clearTimeout(timeout);
    }

    return {
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      sha256: input.sha256,
    };
  }

  /** GC가 private object의 allow-list metadata만 확인한다 */
  async inspect(
    storageKey: string,
  ): ReturnType<TtsAudioGarbageStore['inspect']> {
    assertStorageKey(storageKey);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        }),
      );
      return metadataFromHead(storageKey, result);
    } catch (error) {
      if (isAwsError(error, 404)) return null;
      if (
        error instanceof Error &&
        error.message === 'S3_TTS_AUDIO_METADATA_INVALID'
      ) {
        throw error;
      }
      throw new Error('S3_TTS_AUDIO_INSPECT_FAILED');
    }
  }

  /** DB reference 확인 뒤 전달된 reserved object만 멱등 삭제한다 */
  async delete(storageKey: string): Promise<void> {
    assertStorageKey(storageKey);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        }),
      );
    } catch {
      throw new Error('S3_TTS_AUDIO_DELETE_FAILED');
    }
  }
}
