/** 로컬 TTS WAV를 세대 고유 storage key별 immutable private snapshot으로 보관한다 */
import { createHash } from 'node:crypto';
import type { TtsAudioStore } from '@flex-thia/domain';

interface StoredAudio {
  bytes: Uint8Array;
  mimeType: 'audio/wav';
  sha256: string;
}

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((byte, index) => byte === right[index]);

/** S3 없이 TTS cache의 idempotent private object 저장을 재현하는 fake */
export class FakeTtsAudioStore implements TtsAudioStore {
  private readonly storedByStorageKey = new Map<string, StoredAudio>();

  /** 같은 storage key의 동일 audio만 재시도 저장으로 허용한다 */
  put(
    input: Parameters<TtsAudioStore['put']>[0],
  ): ReturnType<TtsAudioStore['put']> {
    const stored = this.storedByStorageKey.get(input.storageKey);

    if (stored) {
      if (
        stored.mimeType !== input.mimeType ||
        !sameBytes(stored.bytes, input.bytes)
      ) {
        return Promise.reject(new Error('FAKE_TTS_AUDIO_IMMUTABLE_CONFLICT'));
      }
      return Promise.resolve({
        storageKey: input.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.bytes.byteLength,
        sha256: stored.sha256,
      });
    }

    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    this.storedByStorageKey.set(input.storageKey, {
      // caller가 재사용하는 mutable bytes가 cache snapshot을 훼손하지 않게 복사한다.
      bytes: new Uint8Array(input.bytes),
      mimeType: input.mimeType,
      sha256,
    });
    return Promise.resolve({
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      sha256,
    });
  }

  /** 로컬 확인용 read도 복사본만 반환해 저장 snapshot의 불변성을 지킨다 */
  get(storageKey: string): Uint8Array | null {
    const stored = this.storedByStorageKey.get(storageKey);
    return stored ? new Uint8Array(stored.bytes) : null;
  }
}
