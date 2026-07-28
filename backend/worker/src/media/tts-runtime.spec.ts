/** TTS runtime의 동일 durability 주입과 local·production mode 선택을 검증한다 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DeterministicTtsProvider,
  FakeTtsAudioStore,
  LocalFileTtsAudioStore,
  UnavailableTtsAudioStore,
} from '@flex-thia/providers';
import { afterEach, describe, expect, it } from 'vitest';
import { UnavailableTtsProvider } from './tts-processor.js';
import {
  createTtsRuntime,
  resolveLocalTtsAudioDirectory,
} from './tts-runtime.js';

describe('TTS runtime', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('동일 durability instance를 provider run, READY guard와 GC repository에 주입한다', () => {
    const runtime = createTtsRuntime({
      database: {} as never,
      mode: 'local',
    });
    const processorBindings = runtime.processor as unknown as {
      durability: unknown;
    };
    const repositoryBindings = runtime.repository as unknown as {
      audioReadyGuard: unknown;
    };
    const collectorBindings = runtime.collector as unknown as {
      repository: unknown;
    };

    expect(processorBindings.durability).toBe(runtime.durability);
    expect(repositoryBindings.audioReadyGuard).toBe(runtime.durability);
    expect(collectorBindings.repository).toBe(runtime.durability);
  });

  it('local은 같은 디렉터리를 사용하는 별도 runtime에서 audio와 GC 가시성을 공유한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flex-thia-runtime-tts-'));
    directories.push(directory);
    const first = createTtsRuntime({
      database: {} as never,
      mode: 'local',
      localAudioDirectory: directory,
    });
    const second = createTtsRuntime({
      database: {} as never,
      mode: 'local',
      localAudioDirectory: directory,
    });
    const bytes = Uint8Array.from([1, 2, 3]);
    const storageKey =
      'private/tts/runs/00000000-0000-4000-8000-000000000001.wav';

    await first.audioStore.put({
      storageKey,
      bytes,
      mimeType: 'audio/wav',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      signal: new AbortController().signal,
      deadline: new Date(Date.now() + 60_000),
    });

    expect(first.provider).toBeInstanceOf(DeterministicTtsProvider);
    expect(first.audioStore).toBeInstanceOf(LocalFileTtsAudioStore);
    expect(second.audioStore).not.toBe(first.audioStore);
    await expect(
      second.garbageStore.inspect(storageKey),
    ).resolves.toMatchObject({ storageKey, sizeBytes: 3 });
  });

  it('test는 unit 격리를 위한 in-memory fake store를 유지한다', () => {
    const runtime = createTtsRuntime({
      database: {} as never,
      mode: 'test',
    });

    expect(runtime.provider).toBeInstanceOf(DeterministicTtsProvider);
    expect(runtime.audioStore).toBeInstanceOf(FakeTtsAudioStore);
    expect(runtime.garbageStore).toBe(runtime.audioStore);
  });

  it('local directory는 project 전용 환경 변수와 안전한 프로젝트 기본값으로 결정한다', () => {
    expect(
      resolveLocalTtsAudioDirectory(
        { FLEX_THIA_LOCAL_TTS_AUDIO_DIRECTORY: 'var/tts' },
        '/workspace/flex-thia',
        '/system-temp',
      ),
    ).toBe('/workspace/flex-thia/var/tts');
    expect(
      resolveLocalTtsAudioDirectory({}, '/workspace/flex-thia', '/system-temp'),
    ).toBe('/system-temp/flex-thia/tts-audio');
  });

  it('production 미구성은 provider와 object store를 모두 fail-closed로 조립한다', () => {
    const runtime = createTtsRuntime({
      database: {} as never,
      mode: 'production',
    });

    expect(runtime.provider).toBeInstanceOf(UnavailableTtsProvider);
    expect(runtime.audioStore).toBeInstanceOf(UnavailableTtsAudioStore);
    expect(runtime.garbageStore).toBe(runtime.audioStore);
  });
});
