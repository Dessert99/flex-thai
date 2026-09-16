/** refresh 단일 실행과 만료 전 예약 수명주기를 검증한다 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-25T00:00:00.000Z'));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('세션 refresh 조정자', () => {
  it('동시에 발생한 호출은 하나의 refresh Promise를 공유한다', async () => {
    const deferred = createDeferred();
    const refreshAction = vi.fn(() => deferred.promise);
    const { runSessionRefresh } = await import('./sessionRefreshCoordinator');

    const requests = [
      runSessionRefresh(refreshAction),
      runSessionRefresh(refreshAction),
      runSessionRefresh(refreshAction),
    ];

    expect(refreshAction).toHaveBeenCalledOnce();
    deferred.resolve();
    await Promise.all(requests);
  });

  it('만료 1분 전에 refresh를 예약한다', async () => {
    const refreshAction = vi.fn().mockResolvedValue(undefined);
    const { scheduleSessionRefresh } =
      await import('./sessionRefreshCoordinator');

    scheduleSessionRefresh(Date.now() + 120_000, refreshAction);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(refreshAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refreshAction).toHaveBeenCalledOnce();
  });

  it('terminal 전이에서 예약된 refresh를 취소한다', async () => {
    const refreshAction = vi.fn().mockResolvedValue(undefined);
    const { clearSessionRefresh, scheduleSessionRefresh } =
      await import('./sessionRefreshCoordinator');

    scheduleSessionRefresh(Date.now() + 120_000, refreshAction);
    clearSessionRefresh();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(refreshAction).not.toHaveBeenCalled();
  });
});

function createDeferred() {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve() {
      resolvePromise?.();
    },
  };
}
