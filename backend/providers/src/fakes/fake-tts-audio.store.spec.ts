/** fake TTS audio store의 immutable snapshot과 private key를 검증한다 */
import { describe, expect, it } from 'vitest';
import { FakeTtsAudioStore } from './fake-tts-audio.store.js';

describe('FakeTtsAudioStore', () => {
  it('입력 bytes의 복사본을 private storage key 아래 보존한다', async () => {
    const store = new FakeTtsAudioStore();
    const bytes = Uint8Array.from([1, 2, 3]);

    await expect(
      store.put({
        cacheKey: 'cache-key',
        bytes,
        mimeType: 'audio/wav',
        sha256: 'a'.repeat(64),
      }),
    ).resolves.toEqual({ storageKey: 'private/tts/cache-key.wav' });

    bytes[0] = 9;
    const stored = store.get('cache-key');
    expect(stored).toEqual(Uint8Array.from([1, 2, 3]));

    if (stored) stored[1] = 9;
    expect(store.get('cache-key')).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('같은 cache key의 다른 audio는 기존 immutable snapshot을 덮어쓰지 않는다', async () => {
    const store = new FakeTtsAudioStore();
    const input = {
      cacheKey: 'cache-key',
      mimeType: 'audio/wav' as const,
      sha256: 'a'.repeat(64),
    };

    await store.put({ ...input, bytes: Uint8Array.from([1, 2, 3]) });

    await expect(
      store.put({
        ...input,
        bytes: Uint8Array.from([4, 5, 6]),
        sha256: 'b'.repeat(64),
      }),
    ).rejects.toThrow('FAKE_TTS_AUDIO_IMMUTABLE_CONFLICT');
    expect(store.get('cache-key')).toEqual(Uint8Array.from([1, 2, 3]));
  });
});
