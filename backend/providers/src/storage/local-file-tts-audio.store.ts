/** 로컬 TTS WAV를 storageKey 해시 기반 immutable 파일로 보관한다 */
import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { TtsAudioGarbageStore, TtsAudioStore } from '@flex-thia/domain';

interface LocalAudioMetadata {
  mimeType: 'audio/wav';
  sizeBytes: number;
  sha256: string;
}

interface LocalAudioContainer {
  metadata: LocalAudioMetadata;
  bytes: Buffer;
}

interface LocalFileTtsAudioStoreOptions {
  beforeCommit?: (signal: AbortSignal) => Promise<void>;
  cleanupTemporaryFile?: (filePath: string) => Promise<void>;
}

const storageKeyPattern =
  /^private\/tts\/runs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.wav$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;

const isFileSystemError = (
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException =>
  error instanceof Error &&
  'code' in error &&
  (error as NodeJS.ErrnoException).code === code;

const assertStorageKey = (storageKey: string): void => {
  if (!storageKeyPattern.test(storageKey)) {
    throw new Error('LOCAL_TTS_AUDIO_STORAGE_KEY_INVALID');
  }
};

const encodeContainer = (
  metadata: LocalAudioMetadata,
  bytes: Uint8Array,
): Buffer =>
  Buffer.concat([
    Buffer.from(`${JSON.stringify(metadata)}\n`, 'utf8'),
    Buffer.from(bytes),
  ]);

const parseContainer = (content: Buffer): LocalAudioContainer => {
  const separator = content.indexOf(0x0a);
  if (separator <= 0) throw new Error('LOCAL_TTS_AUDIO_OBJECT_INVALID');

  let metadata: unknown;
  try {
    metadata = JSON.parse(content.subarray(0, separator).toString('utf8'));
  } catch {
    throw new Error('LOCAL_TTS_AUDIO_OBJECT_INVALID');
  }
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    !('mimeType' in metadata) ||
    metadata.mimeType !== 'audio/wav' ||
    !('sizeBytes' in metadata) ||
    !Number.isSafeInteger(metadata.sizeBytes) ||
    typeof metadata.sizeBytes !== 'number' ||
    metadata.sizeBytes < 0 ||
    !('sha256' in metadata) ||
    typeof metadata.sha256 !== 'string' ||
    !sha256Pattern.test(metadata.sha256)
  ) {
    throw new Error('LOCAL_TTS_AUDIO_OBJECT_INVALID');
  }

  const bytes = content.subarray(separator + 1);
  const calculatedSha256 = createHash('sha256').update(bytes).digest('hex');
  if (
    bytes.byteLength !== metadata.sizeBytes ||
    calculatedSha256 !== metadata.sha256
  ) {
    throw new Error('LOCAL_TTS_AUDIO_OBJECT_INVALID');
  }
  return {
    metadata: {
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      sha256: metadata.sha256,
    },
    bytes,
  };
};

/** 서로 다른 local process가 같은 directory의 immutable TTS object를 공유한다 */
export class LocalFileTtsAudioStore
  implements TtsAudioStore, TtsAudioGarbageStore
{
  private readonly directory: string;
  private readonly beforeCommit: (signal: AbortSignal) => Promise<void>;
  private readonly cleanupTemporaryFile: (filePath: string) => Promise<void>;

  constructor(directory: string, options: LocalFileTtsAudioStoreOptions = {}) {
    this.directory = resolve(directory);
    this.beforeCommit = options.beforeCommit ?? (() => Promise.resolve());
    this.cleanupTemporaryFile =
      options.cleanupTemporaryFile ??
      ((filePath) => this.unlinkIfPresent(filePath));
  }

  /** 검증된 WAV를 한 파일로 원자 생성해 같은 key의 덮어쓰기를 막는다 */
  async put(
    input: Parameters<TtsAudioStore['put']>[0],
  ): ReturnType<TtsAudioStore['put']> {
    const objectPath = this.objectPath(input.storageKey);
    const calculatedSha256 = createHash('sha256')
      .update(input.bytes)
      .digest('hex');
    if (
      !sha256Pattern.test(input.sha256) ||
      input.sha256 !== calculatedSha256
    ) {
      throw new Error('LOCAL_TTS_AUDIO_SHA256_MISMATCH');
    }

    await this.waitBeforeCommit(input.signal, input.deadline);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    this.assertWritable(input.signal, input.deadline);

    const metadata: LocalAudioMetadata = {
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      sha256: calculatedSha256,
    };
    const temporaryPath = join(
      this.directory,
      `.${createHash('sha256').update(input.storageKey).digest('hex')}.${randomUUID()}.tmp`,
    );
    let finalObjectAccepted = false;
    try {
      await writeFile(temporaryPath, encodeContainer(metadata, input.bytes), {
        flag: 'wx',
        mode: 0o600,
      });
      this.assertWritable(input.signal, input.deadline);
      try {
        await link(temporaryPath, objectPath);
        finalObjectAccepted = true;
      } catch (error) {
        if (!isFileSystemError(error, 'EEXIST')) {
          throw new Error('LOCAL_TTS_AUDIO_WRITE_FAILED');
        }
        const existing = await this.readContainer(objectPath);
        if (
          existing === null ||
          existing.metadata.mimeType !== metadata.mimeType ||
          existing.metadata.sizeBytes !== metadata.sizeBytes ||
          existing.metadata.sha256 !== metadata.sha256
        ) {
          throw new Error('LOCAL_TTS_AUDIO_IMMUTABLE_CONFLICT');
        }
        finalObjectAccepted = true;
        return { storageKey: input.storageKey, ...existing.metadata };
      }

      // atomic link가 성공한 뒤에는 concurrent idempotent writer의 object를 rollback하지 않는다.
      return { storageKey: input.storageKey, ...metadata };
    } finally {
      try {
        await this.cleanupTemporaryFile(temporaryPath);
      } catch {
        if (!finalObjectAccepted) {
          throw new Error('LOCAL_TTS_AUDIO_TEMP_CLEANUP_FAILED');
        }
      }
    }
  }

  /** GC가 해시 경로의 실제 bytes와 immutable metadata를 함께 검증한다 */
  async inspect(
    storageKey: string,
  ): ReturnType<TtsAudioGarbageStore['inspect']> {
    const container = await this.readContainer(this.objectPath(storageKey));
    return container === null ? null : { storageKey, ...container.metadata };
  }

  /** 해시 경로 하나만 멱등 삭제해 caller key가 파일 경로가 되지 않게 한다 */
  async delete(storageKey: string): Promise<void> {
    await this.unlinkIfPresent(this.objectPath(storageKey));
  }

  private objectPath(storageKey: string): string {
    assertStorageKey(storageKey);
    const objectId = createHash('sha256').update(storageKey).digest('hex');
    return join(this.directory, `${objectId}.audio`);
  }

  private async readContainer(
    objectPath: string,
  ): Promise<LocalAudioContainer | null> {
    try {
      return parseContainer(await readFile(objectPath));
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) return null;
      if (
        error instanceof Error &&
        error.message === 'LOCAL_TTS_AUDIO_OBJECT_INVALID'
      ) {
        throw error;
      }
      throw new Error('LOCAL_TTS_AUDIO_READ_FAILED');
    }
  }

  private async unlinkIfPresent(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw new Error('LOCAL_TTS_AUDIO_DELETE_FAILED');
      }
    }
  }

  private assertWritable(signal: AbortSignal, deadline: Date): void {
    if (signal.aborted) {
      throw new Error('LOCAL_TTS_AUDIO_WRITE_ABORTED');
    }
    if (deadline.getTime() <= Date.now()) {
      throw new Error('LOCAL_TTS_AUDIO_WRITE_DEADLINE_EXCEEDED');
    }
  }

  private waitBeforeCommit(signal: AbortSignal, deadline: Date): Promise<void> {
    this.assertWritable(signal, deadline);
    return new Promise((resolveWait, rejectWait) => {
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        clearTimeout(timeout);
        if (error) rejectWait(error);
        else resolveWait();
      };
      const onAbort = (): void =>
        finish(new Error('LOCAL_TTS_AUDIO_WRITE_ABORTED'));
      const timeout = setTimeout(
        () => finish(new Error('LOCAL_TTS_AUDIO_WRITE_DEADLINE_EXCEEDED')),
        Math.max(0, deadline.getTime() - Date.now()),
      );
      signal.addEventListener('abort', onAbort, { once: true });
      this.beforeCommit(signal).then(
        () => finish(),
        () => finish(new Error('LOCAL_TTS_AUDIO_WRITE_FAILED')),
      );
    });
  }
}
