/** TTS task·GC entry가 한 local runtime과 audio store를 공유하는지 검증한다 */
import type { SQSEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createTtsAudioGcTaskHandler } from './tts-audio-gc-task.js';
import { createTtsEntryRuntimeProvider } from './tts-entry-runtime.js';
import { createTtsSqsHandler } from './tts-task-entry.js';

describe('TTS entry runtime provider', () => {
  it('task·GC·read 경로가 같은 runtime과 audio store identity를 재사용한다', () => {
    const audioStore = {};
    const runtime = {
      audioStore,
      taskHandler: vi.fn(),
      collector: { processBatch: vi.fn() },
    };
    const createRuntime = vi.fn(() => runtime);
    const provider = createTtsEntryRuntimeProvider(createRuntime);

    const taskRuntime = provider.get();
    const gcRuntime = provider.get();
    const readRuntime = provider.get();

    expect(taskRuntime).toBe(runtime);
    expect(gcRuntime).toBe(taskRuntime);
    expect(readRuntime.audioStore).toBe(taskRuntime.audioStore);
    expect(createRuntime).toHaveBeenCalledTimes(1);
  });

  it('실제 task·GC entry factory가 한 provider의 runtime을 함께 사용한다', async () => {
    const taskHandler = vi.fn().mockResolvedValue({ kind: 'PROCESSED' });
    const processBatch = vi.fn().mockResolvedValue({ deleted: 1 });
    const createRuntime = vi.fn(() => ({
      audioStore: {},
      taskHandler,
      collector: { processBatch },
    }));
    const provider = createTtsEntryRuntimeProvider(createRuntime);
    const taskEntry = createTtsSqsHandler(
      () => provider.get().taskHandler as never,
    );
    const gcEntry = createTtsAudioGcTaskHandler(() => provider.get() as never);

    await taskEntry({
      Records: [
        {
          messageId: 'message-1',
          body: '{"jobId":"00000000-0000-4000-8000-000000000001","attempt":0}',
        },
      ],
    } as SQSEvent);
    await gcEntry({ workerId: 'gc-worker' });

    expect(taskHandler).toHaveBeenCalledTimes(1);
    expect(processBatch).toHaveBeenCalledWith(
      expect.objectContaining({ workerId: 'gc-worker' }),
    );
    expect(createRuntime).toHaveBeenCalledTimes(1);
  });
});
