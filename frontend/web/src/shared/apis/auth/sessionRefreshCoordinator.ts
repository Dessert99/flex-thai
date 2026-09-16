/** 세션 refresh의 단일 실행과 만료 전 예약을 조정한다 */

const REFRESH_LEAD_TIME_MS = 60_000;

let inFlightRefresh: Promise<void> | undefined;
let refreshTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

/** 동시에 요청된 refresh를 하나의 Promise로 합친다 */
export function runSessionRefresh(
  refreshAction: () => Promise<void>,
): Promise<void> {
  if (inFlightRefresh !== undefined) {
    return inFlightRefresh;
  }

  const coordinatedRefresh = refreshAction().finally(() => {
    if (inFlightRefresh === coordinatedRefresh) {
      inFlightRefresh = undefined;
    }
  });
  inFlightRefresh = coordinatedRefresh;

  return coordinatedRefresh;
}

/** access token 만료 1분 전에 한 번의 refresh를 예약한다 */
export function scheduleSessionRefresh(
  expiresAt: number,
  refreshAction: () => Promise<void>,
): void {
  clearSessionRefresh();
  const delay = Math.max(0, expiresAt - Date.now() - REFRESH_LEAD_TIME_MS);

  refreshTimer = globalThis.setTimeout(() => {
    refreshTimer = undefined;
    void refreshAction();
  }, delay);
}

/** terminal 세션 전이에서 예약된 refresh를 취소한다 */
export function clearSessionRefresh(): void {
  if (refreshTimer !== undefined) {
    globalThis.clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
}
