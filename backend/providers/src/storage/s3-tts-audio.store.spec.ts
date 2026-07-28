/** private S3 TTS object의 불변 metadata와 실패 시 비가시성을 검증한다 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { S3TtsAudioStore } from './s3-tts-audio.store.js';

const storageKey = 'private/tts/runs/00000000-0000-4000-8000-000000000001.wav';
const bytes = Uint8Array.from([82, 73, 70, 70]);
const sha256 = createHash('sha256').update(bytes).digest('hex');

const putInput = (overrides: Record<string, unknown> = {}) => ({
  storageKey,
  bytes,
  mimeType: 'audio/wav' as const,
  sha256,
  signal: new AbortController().signal,
  deadline: new Date(Date.now() + 60_000),
  ...overrides,
});

describe('S3TtsAudioStore', () => {
  it('reserved key에 private WAV와 immutable metadata를 조건부 저장한다', async () => {
    const send = vi.fn().mockResolvedValue({ ETag: '"etag"' });
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(store.put(putInput())).resolves.toEqual({
      storageKey,
      mimeType: 'audio/wav',
      sizeBytes: 4,
      sha256,
    });
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        Bucket: 'media-bucket',
        Key: storageKey,
        Body: bytes,
        ContentType: 'audio/wav',
        IfNoneMatch: '*',
        Metadata: {
          sha256,
          sizebytes: '4',
        },
      },
    });
  });

  it('Head metadata가 완전하고 bytes hash와 일치할 때만 inspect 결과를 반환한다', async () => {
    const send = vi.fn().mockResolvedValue({
      ContentType: 'audio/wav',
      ContentLength: 4,
      Metadata: { sha256, sizebytes: '4' },
    });
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(store.inspect(storageKey)).resolves.toEqual({
      storageKey,
      mimeType: 'audio/wav',
      sizeBytes: 4,
      sha256,
    });
  });

  it('abort된 put은 AWS에 object를 보내지 않는다', async () => {
    const send = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(
      store.put(putInput({ signal: controller.signal })),
    ).rejects.toThrow('S3_TTS_AUDIO_WRITE_ABORTED');
    expect(send).not.toHaveBeenCalled();
  });

  it('reserved key 밖의 inspect와 delete를 AWS 호출 전에 거절한다', async () => {
    const send = vi.fn();
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(store.inspect('public/audio.wav')).rejects.toThrow(
      'S3_TTS_AUDIO_STORAGE_KEY_INVALID',
    );
    await expect(store.delete('../secret')).rejects.toThrow(
      'S3_TTS_AUDIO_STORAGE_KEY_INVALID',
    );
    expect(send).not.toHaveBeenCalled();
  });
});
