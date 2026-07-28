/** 로컬 worker runner의 반복 실행과 signal 종료 경계를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { runLocalWorker } from './local-worker.js';

describe('로컬 worker runner', () => {
  it('relay와 GC를 즉시 실행한 뒤 signal 대기 중 정상 종료한다', async () => {
    const controller = new AbortController();
    const events: string[] = [];
    const wait = vi.fn(() => {
      controller.abort();
      return Promise.resolve();
    });

    await runLocalWorker({
      signal: controller.signal,
      relay: () => {
        events.push('relay');
        return Promise.resolve();
      },
      collectGarbage: () => {
        events.push('gc');
        return Promise.resolve();
      },
      reportError: vi.fn(),
      wait,
    });

    expect(events).toEqual(['relay', 'gc']);
    expect(wait).toHaveBeenCalledWith(controller.signal, 1_000);
  });

  it('한 cycle 실패를 보고하고 다음 bounded poll에서 다시 처리한다', async () => {
    const controller = new AbortController();
    const relay = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('relay failed'))
      .mockResolvedValue();
    const collectGarbage = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('gc failed'))
      .mockResolvedValue();
    const reportError = vi.fn();
    const wait = vi.fn(() => {
      if (wait.mock.calls.length === 2) controller.abort();
      return Promise.resolve();
    });

    await runLocalWorker({
      signal: controller.signal,
      relay,
      collectGarbage,
      reportError,
      wait,
    });

    expect(relay).toHaveBeenCalledTimes(2);
    expect(collectGarbage).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('poll timeout을 기다리는 중 abort signal이 오면 즉시 종료한다', async () => {
    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), 1);

    await runLocalWorker({
      signal: controller.signal,
      relay: () => Promise.resolve(),
      collectGarbage: () => Promise.resolve(),
      reportError: vi.fn(),
      pollIntervalMs: 10_000,
    });

    clearTimeout(abort);
    expect(controller.signal.aborted).toBe(true);
  });
});
