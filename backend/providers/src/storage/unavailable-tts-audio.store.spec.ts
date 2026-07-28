/** production TTS object storage 미구성 경계가 생성·GC를 fail-closed로 막는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { UnavailableTtsAudioStore } from './unavailable-tts-audio.store.js';

describe('UnavailableTtsAudioStore', () => {
  it('put·inspect·delete 모두 안정적인 unavailable 오류로 거절한다', async () => {
    const store = new UnavailableTtsAudioStore();

    await expect(
      store.put({
        storageKey: 'private/tts/runs/run-id.wav',
        bytes: new Uint8Array([1]),
        mimeType: 'audio/wav',
        sha256: 'a'.repeat(64),
        signal: new AbortController().signal,
        deadline: new Date('2026-07-28T00:01:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'TTS_AUDIO_STORE_UNAVAILABLE',
      retryable: false,
    });
    await expect(store.inspect('private/tts/runs/run-id.wav')).rejects.toThrow(
      'TTS_AUDIO_STORE_UNAVAILABLE',
    );
    await expect(store.delete('private/tts/runs/run-id.wav')).rejects.toThrow(
      'TTS_AUDIO_STORE_UNAVAILABLE',
    );
  });
});
