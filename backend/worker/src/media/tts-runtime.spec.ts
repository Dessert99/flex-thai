/** TTS runtime의 동일 durability 주입과 local·production mode 선택을 검증한다 */
import {
  DeterministicTtsProvider,
  FakeTtsAudioStore,
  UnavailableTtsAudioStore,
} from '@flex-thia/providers';
import { describe, expect, it } from 'vitest';
import { UnavailableTtsProvider } from './tts-processor.js';
import { createTtsRuntime } from './tts-runtime.js';

describe('TTS runtime', () => {
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

  it('local은 결정적 provider와 생성·GC를 함께 지원하는 한 store를 사용한다', () => {
    const runtime = createTtsRuntime({
      database: {} as never,
      mode: 'test',
    });

    expect(runtime.provider).toBeInstanceOf(DeterministicTtsProvider);
    expect(runtime.audioStore).toBeInstanceOf(FakeTtsAudioStore);
    expect(runtime.garbageStore).toBe(runtime.audioStore);
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
