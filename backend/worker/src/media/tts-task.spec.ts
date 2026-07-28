/** TTS dispatch message의 세대 검증·부분 실패·malformed terminal 처리를 검증한다 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method -- Vitest matcher와 port method spy를 직접 검증한다. */
import { describe, expect, it, vi } from 'vitest';
import {
  createTtsTaskHandler,
  type TtsDispatchStateRepository,
  type TtsTaskProcessor,
} from './tts-task.js';

const jobId = '00000000-0000-4000-8000-000000000001';

const createRepository = (
  state: Awaited<ReturnType<TtsDispatchStateRepository['getDispatchState']>> = {
    dispatchAttempt: 2,
    status: 'PARTIALLY_FAILED',
  },
): TtsDispatchStateRepository => ({
  getDispatchState: vi.fn(() => Promise.resolve(state)),
});

describe('TTS task handler', () => {
  it('현재 dispatch 세대 하나를 processor에 전달하고 부분 실패를 정상 결과로 반환한다', async () => {
    const repository = createRepository();
    const processor: TtsTaskProcessor = {
      processDispatch: vi.fn(() =>
        Promise.resolve({
          kind: 'PROCESSED' as const,
          status: 'PARTIALLY_FAILED' as const,
        }),
      ),
    };
    const handler = createTtsTaskHandler(repository, processor);

    await expect(handler({ jobId, attempt: 2 })).resolves.toEqual({
      kind: 'PROCESSED',
      jobId,
      status: 'PARTIALLY_FAILED',
    });
    expect(processor.processDispatch).toHaveBeenCalledWith({
      jobId,
      dispatchAttempt: 2,
      signal: expect.any(AbortSignal),
    });
  });

  it('중복 전달은 provider 예외로 확대하지 않고 processor의 canonical 결과를 그대로 반환한다', async () => {
    const repository = createRepository({
      dispatchAttempt: 0,
      status: 'SUCCEEDED',
    });
    const processor: TtsTaskProcessor = {
      processDispatch: vi.fn(() =>
        Promise.resolve({
          kind: 'IGNORED' as const,
          status: 'SUCCEEDED' as const,
        }),
      ),
    };
    const handler = createTtsTaskHandler(repository, processor);

    await expect(handler({ jobId, attempt: 0 })).resolves.toEqual({
      kind: 'IGNORED',
      jobId,
      status: 'SUCCEEDED',
    });
  });

  it('stale·없는 job은 processor를 호출하지 않고 무해하게 무시한다', async () => {
    const staleProcessor: TtsTaskProcessor = {
      processDispatch: vi.fn(),
    };
    const staleHandler = createTtsTaskHandler(
      createRepository({ dispatchAttempt: 3, status: 'QUEUED' }),
      staleProcessor,
    );
    const missingProcessor: TtsTaskProcessor = {
      processDispatch: vi.fn(),
    };
    const missingHandler = createTtsTaskHandler(
      createRepository(null),
      missingProcessor,
    );

    await expect(staleHandler({ jobId, attempt: 2 })).resolves.toEqual({
      kind: 'IGNORED',
      jobId,
      status: 'STALE_DISPATCH',
    });
    await expect(missingHandler({ jobId, attempt: 0 })).resolves.toEqual({
      kind: 'IGNORED',
      jobId,
      status: 'JOB_NOT_FOUND',
    });
    expect(staleProcessor.processDispatch).not.toHaveBeenCalled();
    expect(missingProcessor.processDispatch).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { jobId: 'not-a-uuid', attempt: 0 },
    { jobId, attempt: -1 },
    { jobId, attempt: 0, secret: 'extra' },
  ])(
    '잘못된 message %j는 terminal malformed이며 DB와 processor를 호출하지 않는다',
    async (message) => {
      const repository = createRepository();
      const processor: TtsTaskProcessor = {
        processDispatch: vi.fn(),
      };
      const handler = createTtsTaskHandler(repository, processor);

      await expect(handler(message)).resolves.toEqual({
        kind: 'MALFORMED',
        errorCode: 'TTS_DISPATCH_MESSAGE_INVALID',
      });
      expect(repository.getDispatchState).not.toHaveBeenCalled();
      expect(processor.processDispatch).not.toHaveBeenCalled();
    },
  );
});
