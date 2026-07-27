/** 로컬 TTS WAV를 cache key별 immutable private snapshot으로 보관한다 */
import type { TtsAudioStore } from '@flex-thia/domain';

interface StoredAudio {
  bytes: Uint8Array;
  sha256: string;
}

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((byte, index) => byte === right[index]);

/** S3 없이 TTS cache의 idempotent private object 저장을 재현하는 fake */
export class FakeTtsAudioStore implements TtsAudioStore {
  private readonly storedByCacheKey = new Map<string, StoredAudio>();

  /** 같은 cache key의 동일 audio만 재시도 저장으로 허용한다 */
  put(
    input: Parameters<TtsAudioStore['put']>[0],
  ): Promise<{ storageKey: string }> {
    const stored = this.storedByCacheKey.get(input.cacheKey);

    if (stored) {
      if (
        stored.sha256 !== input.sha256 ||
        !sameBytes(stored.bytes, input.bytes)
      ) {
        return Promise.reject(new Error('FAKE_TTS_AUDIO_IMMUTABLE_CONFLICT'));
      }
      return Promise.resolve({ storageKey: this.toStorageKey(input.cacheKey) });
    }

    this.storedByCacheKey.set(input.cacheKey, {
      // caller가 재사용하는 mutable bytes가 cache snapshot을 훼손하지 않게 복사한다.
      bytes: new Uint8Array(input.bytes),
      sha256: input.sha256,
    });
    return Promise.resolve({ storageKey: this.toStorageKey(input.cacheKey) });
  }

  /** 로컬 확인용 read도 복사본만 반환해 저장 snapshot의 불변성을 지킨다 */
  get(cacheKey: string): Uint8Array | null {
    const stored = this.storedByCacheKey.get(cacheKey);
    return stored ? new Uint8Array(stored.bytes) : null;
  }

  private toStorageKey(cacheKey: string): string {
    return `private/tts/${cacheKey}.wav`;
  }
}
