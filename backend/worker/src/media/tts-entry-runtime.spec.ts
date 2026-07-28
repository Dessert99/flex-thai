/** TTS entry provider의 cold-start 재사용과 task·GC factory 연결을 검증한다 */
import type { SQSEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createTtsAudioGcTaskHandler } from './tts-audio-gc-task.js';
import {
  createProductionTtsAudioStore,
  createTtsEntryRuntimeProvider,
} from './tts-entry-runtime.js';
import { createTtsSqsHandler } from './tts-task-entry.js';

describe('TTS entry runtime provider', () => {
  it('같은 provider의 반복 호출은 cold-start runtime을 한 번만 만든다', () => {
    const runtime = {
      taskHandler: vi.fn(),
      collector: { processBatch: vi.fn() },
    };
    const createRuntime = vi.fn(() => runtime);
    const provider = createTtsEntryRuntimeProvider(createRuntime);

    expect(provider.get()).toBe(runtime);
    expect(provider.get()).toBe(runtime);
    expect(createRuntime).toHaveBeenCalledTimes(1);
  });

  it('실제 task·GC entry factory가 한 provider의 runtime을 함께 사용한다', async () => {
    const taskHandler = vi.fn().mockResolvedValue({ kind: 'PROCESSED' });
    const processBatch = vi.fn().mockResolvedValue({ deleted: 1 });
    const createRuntime = vi.fn(() => ({
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

  it('production entry는 region과 private media bucket으로 S3 store를 만든다', () => {
    const store = { put: vi.fn(), inspect: vi.fn(), delete: vi.fn() };
    const createStore = vi.fn(() => store);

    expect(
      createProductionTtsAudioStore(
        {
          AWS_REGION: 'ap-northeast-2',
          MEDIA_BUCKET_NAME: 'private-media',
        },
        createStore,
      ),
    ).toBe(store);
    expect(createStore).toHaveBeenCalledWith({
      region: 'ap-northeast-2',
      bucketName: 'private-media',
    });
  });
});
