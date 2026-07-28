/** private S3 TTS object의 불변 metadata와 실패 시 비가시성을 검증한다 */
import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { S3TtsAudioStore } from './s3-tts-audio.store.js';

const storageKey = 'private/tts/runs/00000000-0000-4000-8000-000000000001.wav';
const bytes = Uint8Array.from([82, 73, 70, 70]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const awsError = (statusCode: number) =>
  Object.assign(new Error(`AWS ${statusCode}`), {
    $metadata: { httpStatusCode: statusCode },
  });

const putInput = (overrides: Record<string, unknown> = {}) => ({
  storageKey,
  bytes,
  mimeType: 'audio/wav' as const,
  sha256,
  signal: new AbortController().signal,
  deadline: new Date(Date.now() + 60_000),
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
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

  it('HeadObject 404는 삭제 확인에 사용할 수 있는 null로 반환한다', async () => {
    const send = vi.fn().mockRejectedValue(awsError(404));
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(store.inspect(storageKey)).resolves.toBeNull();
  });

  it('caller sha256이 실제 WAV bytes와 다르면 AWS 호출 전에 거절한다', async () => {
    const send = vi.fn();
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(
      store.put(putInput({ sha256: 'f'.repeat(64) })),
    ).rejects.toThrow('S3_TTS_AUDIO_SHA256_MISMATCH');
    expect(send).not.toHaveBeenCalled();
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

  it('mid-flight abort 오류 뒤 exact object가 commit됐으면 reject하지 않고 성공으로 조정한다', async () => {
    const controller = new AbortController();
    let committed = false;
    const send = vi.fn((command: unknown) => {
      if (command instanceof PutObjectCommand) {
        committed = true;
        controller.abort();
        return Promise.reject(new Error('AbortError'));
      }
      if (command instanceof HeadObjectCommand && committed) {
        return Promise.resolve({
          ContentType: 'audio/wav',
          ContentLength: bytes.byteLength,
          Metadata: { sha256, sizebytes: String(bytes.byteLength) },
        });
      }
      return Promise.reject(new Error('unexpected command'));
    });
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(
      store.put(putInput({ signal: controller.signal })),
    ).resolves.toEqual({
      storageKey,
      mimeType: 'audio/wav',
      sizeBytes: bytes.byteLength,
      sha256,
    });
  });

  it('abort 오류 직후 404여도 뒤늦게 보이는 exact object까지 bounded reconcile한다', async () => {
    const controller = new AbortController();
    let headAttempts = 0;
    const send = vi.fn((command: unknown) => {
      if (command instanceof PutObjectCommand) {
        controller.abort();
        return Promise.reject(new Error('AbortError'));
      }
      if (command instanceof HeadObjectCommand) {
        headAttempts += 1;
        if (headAttempts === 1) {
          return Promise.reject(awsError(404));
        }
        return Promise.resolve({
          ContentType: 'audio/wav',
          ContentLength: bytes.byteLength,
          Metadata: { sha256, sizebytes: String(bytes.byteLength) },
        });
      }
      return Promise.reject(new Error('unexpected command'));
    });
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(
      store.put(putInput({ signal: controller.signal })),
    ).resolves.toMatchObject({ storageKey, sha256 });
    expect(headAttempts).toBe(2);
  });

  it('동시 writer의 exact object는 replay 성공으로 보존하고 삭제하지 않는다', async () => {
    const send = vi.fn((command: unknown) => {
      if (command instanceof PutObjectCommand) {
        return Promise.reject(awsError(412));
      }
      if (command instanceof HeadObjectCommand) {
        return Promise.resolve({
          ContentType: 'audio/wav',
          ContentLength: bytes.byteLength,
          Metadata: { sha256, sizebytes: String(bytes.byteLength) },
        });
      }
      return Promise.reject(new Error('unexpected command'));
    });
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(store.put(putInput())).resolves.toMatchObject({
      storageKey,
      sha256,
    });
    expect(
      send.mock.calls.some(
        ([command]) => command instanceof DeleteObjectCommand,
      ),
    ).toBe(false);
  });

  it('deadline 중 client 오류 뒤 exact object가 commit됐으면 성공으로 조정한다', async () => {
    vi.useFakeTimers();
    const startedAt = new Date('2026-07-28T00:00:00.000Z');
    const deadline = new Date(startedAt.getTime() + 1_000);
    vi.setSystemTime(startedAt);
    const send = vi.fn((command: unknown) => {
      if (command instanceof PutObjectCommand) {
        vi.setSystemTime(new Date(deadline.getTime() + 1));
        return Promise.reject(new Error('TimeoutError'));
      }
      if (command instanceof HeadObjectCommand) {
        return Promise.resolve({
          ContentType: 'audio/wav',
          ContentLength: bytes.byteLength,
          Metadata: { sha256, sizebytes: String(bytes.byteLength) },
        });
      }
      return Promise.reject(new Error('unexpected command'));
    });
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(store.put(putInput({ deadline }))).resolves.toMatchObject({
      storageKey,
      sha256,
    });
  });

  it('Put이 성공한 뒤 deadline이 지나도 visible exact object 결과를 성공으로 유지한다', async () => {
    vi.useFakeTimers();
    const startedAt = new Date('2026-07-28T00:00:00.000Z');
    const deadline = new Date(startedAt.getTime() + 1_000);
    vi.setSystemTime(startedAt);
    const send = vi.fn((command: unknown) => {
      if (command instanceof PutObjectCommand) {
        vi.setSystemTime(new Date(deadline.getTime() + 1));
        return Promise.resolve({ ETag: '"etag"' });
      }
      return Promise.reject(new Error('unexpected command'));
    });
    const store = new S3TtsAudioStore({ send } as never, 'media-bucket');

    await expect(store.put(putInput({ deadline }))).resolves.toMatchObject({
      storageKey,
      sha256,
    });
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
