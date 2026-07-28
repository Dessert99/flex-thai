/** 로컬 파일 TTS 저장소의 프로세스 간 가시성·불변성·경로 안전성을 검증한다 */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalFileTtsAudioStore } from './local-file-tts-audio.store.js';

const directories: string[] = [];
const storageKey = 'private/tts/runs/00000000-0000-4000-8000-000000000001.wav';
const writableUntil = (): Date => new Date(Date.now() + 60_000);

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'flex-thia-local-tts-'));
  directories.push(directory);
  return directory;
};

const input = (bytes: Uint8Array) => ({
  storageKey,
  bytes,
  mimeType: 'audio/wav' as const,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  signal: new AbortController().signal,
  deadline: writableUntil(),
});

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('LocalFileTtsAudioStore', () => {
  it('같은 디렉터리의 별도 instance가 put·inspect·delete 결과를 공유한다', async () => {
    const directory = await createDirectory();
    const writer = new LocalFileTtsAudioStore(directory);
    const collector = new LocalFileTtsAudioStore(directory);
    const bytes = Uint8Array.from([1, 2, 3]);
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    await expect(writer.put(input(bytes))).resolves.toEqual({
      storageKey,
      mimeType: 'audio/wav',
      sizeBytes: 3,
      sha256,
    });
    await expect(collector.inspect(storageKey)).resolves.toEqual({
      storageKey,
      mimeType: 'audio/wav',
      sizeBytes: 3,
      sha256,
    });

    await collector.delete(storageKey);
    await collector.delete(storageKey);
    await expect(writer.inspect(storageKey)).resolves.toBeNull();
  });

  it('storageKey는 해시 파일명으로만 저장해 경로와 container에 private key를 노출하지 않는다', async () => {
    const directory = await createDirectory();
    const store = new LocalFileTtsAudioStore(directory);
    await store.put(input(Uint8Array.from([1, 2, 3])));

    const files = await readdir(directory);
    const expectedName = `${createHash('sha256').update(storageKey).digest('hex')}.audio`;
    expect(files).toEqual([expectedName]);
    expect(files[0]).not.toContain('private');
    expect(
      (await readFile(join(directory, expectedName))).includes(storageKey),
    ).toBe(false);
  });

  it('같은 key의 동일 WAV는 멱등 반환하고 다른 WAV는 기존 object를 덮어쓰지 않는다', async () => {
    const directory = await createDirectory();
    const first = new LocalFileTtsAudioStore(directory);
    const second = new LocalFileTtsAudioStore(directory);
    const firstBytes = Uint8Array.from([1, 2, 3]);

    await first.put(input(firstBytes));
    await expect(second.put(input(firstBytes))).resolves.toMatchObject({
      storageKey,
      sizeBytes: 3,
    });
    await expect(second.put(input(Uint8Array.from([4, 5, 6])))).rejects.toThrow(
      'LOCAL_TTS_AUDIO_IMMUTABLE_CONFLICT',
    );
    await expect(first.inspect(storageKey)).resolves.toMatchObject({
      sha256: createHash('sha256').update(firstBytes).digest('hex'),
    });
  });

  it('caller sha256이 실제 WAV bytes와 다르면 metadata를 만들지 않는다', async () => {
    const directory = await createDirectory();
    const store = new LocalFileTtsAudioStore(directory);

    await expect(
      store.put({
        ...input(Uint8Array.from([1, 2, 3])),
        sha256: '0'.repeat(64),
      }),
    ).rejects.toThrow('LOCAL_TTS_AUDIO_SHA256_MISMATCH');
    await expect(store.inspect(storageKey)).resolves.toBeNull();
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it.each([
    '',
    '../private/tts/runs/00000000-0000-4000-8000-000000000001.wav',
    'private/tts/runs/../../secret.wav',
    'private/tts/runs/not-a-run.wav',
    'private/tts/runs/00000000-0000-4000-8000-000000000001.wav\u0000',
  ])('안전하지 않은 storage key %j를 파일 접근 전에 거절한다', async (key) => {
    const directory = await createDirectory();
    const store = new LocalFileTtsAudioStore(directory);

    await expect(store.inspect(key)).rejects.toThrow(
      'LOCAL_TTS_AUDIO_STORAGE_KEY_INVALID',
    );
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it('commit 대기 중 abort되면 준비 작업이 끝나도 object를 늦게 노출하지 않는다', async () => {
    const directory = await createDirectory();
    let finishPreparation!: () => void;
    const preparation = new Promise<void>((resolve) => {
      finishPreparation = resolve;
    });
    const store = new LocalFileTtsAudioStore(directory, {
      beforeCommit: () => preparation,
    });
    const controller = new AbortController();
    const bytes = Uint8Array.from([1, 2, 3]);
    const writing = store.put({
      ...input(bytes),
      signal: controller.signal,
    });

    controller.abort();
    await expect(writing).rejects.toThrow('LOCAL_TTS_AUDIO_WRITE_ABORTED');
    finishPreparation();
    await preparation;
    await expect(store.inspect(storageKey)).resolves.toBeNull();
  });

  it('지난 deadline의 put은 디렉터리에 object를 만들지 않는다', async () => {
    const directory = await createDirectory();
    const store = new LocalFileTtsAudioStore(directory);

    await expect(
      store.put({
        ...input(Uint8Array.from([1, 2, 3])),
        deadline: new Date(Date.now() - 1),
      }),
    ).rejects.toThrow('LOCAL_TTS_AUDIO_WRITE_DEADLINE_EXCEEDED');
    await expect(readdir(directory)).resolves.toEqual([]);
  });
});
