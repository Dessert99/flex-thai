/** fake TTS audio store의 immutable snapshot과 private key를 검증한다 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeTtsAudioStore } from './fake-tts-audio.store.js';

describe('FakeTtsAudioStore', () => {
  it('입력 bytes의 복사본을 private storage key 아래 보존한다', async () => {
    const store = new FakeTtsAudioStore();
    const bytes = Uint8Array.from([1, 2, 3]);

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await expect(
      store.put({
        storageKey: 'private/tts/runs/run-1.wav',
        bytes,
        mimeType: 'audio/wav',
        sha256,
      }),
    ).resolves.toEqual({
      storageKey: 'private/tts/runs/run-1.wav',
      mimeType: 'audio/wav',
      sizeBytes: 3,
      sha256,
    });

    bytes[0] = 9;
    const stored = store.get('private/tts/runs/run-1.wav');
    expect(stored).toEqual(Uint8Array.from([1, 2, 3]));

    if (stored) stored[1] = 9;
    expect(store.get('private/tts/runs/run-1.wav')).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
  });

  it('같은 cache key의 다른 audio는 기존 immutable snapshot을 덮어쓰지 않는다', async () => {
    const store = new FakeTtsAudioStore();
    const firstBytes = Uint8Array.from([1, 2, 3]);
    const input = {
      storageKey: 'private/tts/runs/run-1.wav',
      mimeType: 'audio/wav' as const,
      sha256: createHash('sha256').update(firstBytes).digest('hex'),
    };

    await store.put({ ...input, bytes: firstBytes });

    await expect(
      store.put({
        ...input,
        bytes: Uint8Array.from([4, 5, 6]),
        sha256: createHash('sha256')
          .update(Uint8Array.from([4, 5, 6]))
          .digest('hex'),
      }),
    ).rejects.toThrow('FAKE_TTS_AUDIO_IMMUTABLE_CONFLICT');
    expect(store.get('private/tts/runs/run-1.wav')).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
  });

  it('서로 다른 세대 key는 같은 cache 입력이어도 독립 immutable object로 보존한다', async () => {
    const store = new FakeTtsAudioStore();
    const bytes = Uint8Array.from([1, 2, 3]);
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    await store.put({
      storageKey: 'private/tts/runs/run-1.wav',
      bytes,
      mimeType: 'audio/wav',
      sha256,
    });
    await store.put({
      storageKey: 'private/tts/runs/run-2.wav',
      bytes,
      mimeType: 'audio/wav',
      sha256,
    });

    expect(store.get('private/tts/runs/run-1.wav')).toEqual(bytes);
    expect(store.get('private/tts/runs/run-2.wav')).toEqual(bytes);
  });
});
