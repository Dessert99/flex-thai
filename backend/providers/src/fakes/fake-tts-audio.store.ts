/** 로컬 TTS WAV를 세대 고유 storage key별 immutable private snapshot으로 보관한다 */
import { createHash } from 'node:crypto';
import type { TtsAudioGarbageStore, TtsAudioStore } from '@flex-thia/domain';

interface StoredAudio {
  bytes: Uint8Array;
  mimeType: 'audio/wav';
  sha256: string;
}

type BeforeAudioCommit = (signal: AbortSignal) => Promise<void>;

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((byte, index) => byte === right[index]);

/** S3 없이 TTS cache의 idempotent private object 저장을 재현하는 fake */
export class FakeTtsAudioStore implements TtsAudioStore, TtsAudioGarbageStore {
  private readonly storedByStorageKey = new Map<string, StoredAudio>();

  constructor(
    private readonly beforeCommit: BeforeAudioCommit = () => Promise.resolve(),
  ) {}

  /** 같은 storage key의 동일 audio만 재시도 저장으로 허용한다 */
  async put(
    input: Parameters<TtsAudioStore['put']>[0],
  ): ReturnType<TtsAudioStore['put']> {
    await this.waitBeforeCommit(input.signal, input.deadline);
    const stored = this.storedByStorageKey.get(input.storageKey);

    if (stored) {
      if (
        stored.mimeType !== input.mimeType ||
        !sameBytes(stored.bytes, input.bytes)
      ) {
        throw new Error('FAKE_TTS_AUDIO_IMMUTABLE_CONFLICT');
      }
      return {
        storageKey: input.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.bytes.byteLength,
        sha256: stored.sha256,
      };
    }

    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    this.storedByStorageKey.set(input.storageKey, {
      // caller가 재사용하는 mutable bytes가 cache snapshot을 훼손하지 않게 복사한다.
      bytes: new Uint8Array(input.bytes),
      mimeType: input.mimeType,
      sha256,
    });
    return {
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      sha256,
    };
  }

  /** 로컬 확인용 read도 복사본만 반환해 저장 snapshot의 불변성을 지킨다 */
  get(storageKey: string): Uint8Array | null {
    const stored = this.storedByStorageKey.get(storageKey);
    return stored ? new Uint8Array(stored.bytes) : null;
  }

  /** GC가 삭제 전 object의 실제 immutable metadata를 재확인하게 한다 */
  inspect(storageKey: string): ReturnType<TtsAudioGarbageStore['inspect']> {
    const stored = this.storedByStorageKey.get(storageKey);
    return Promise.resolve(
      stored
        ? {
            storageKey,
            mimeType: stored.mimeType,
            sizeBytes: stored.bytes.byteLength,
            sha256: stored.sha256,
          }
        : null,
    );
  }

  /** run 고유 key 삭제를 멱등 처리해 relay redelivery를 안전하게 한다 */
  delete(storageKey: string): Promise<void> {
    this.storedByStorageKey.delete(storageKey);
    return Promise.resolve();
  }

  private waitBeforeCommit(signal: AbortSignal, deadline: Date): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        if (timeout) clearTimeout(timeout);
        if (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('FAKE_TTS_AUDIO_WRITE_FAILED'),
          );
        } else resolve();
      };
      const onAbort = (): void =>
        finish(new Error('FAKE_TTS_AUDIO_WRITE_ABORTED'));
      const remainingMs = deadline.getTime() - Date.now();
      if (signal.aborted || remainingMs <= 0) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      timeout = setTimeout(onAbort, remainingMs);
      this.beforeCommit(signal).then(
        () => finish(),
        (error: unknown) => finish(error),
      );
    });
  }
}
