/** Query의 일시 오류만 한 번 재시도하고 mutation 자동 재시도를 금지한다 */
import { ApiError } from './ApiError';

const retryableStatuses = new Set([502, 503, 504]);

/** 최초 network·timeout·gateway 오류에만 Query 재시도를 허용한다 */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 1 || !(error instanceof ApiError)) {
    return false;
  }
  if (error.detail.kind === 'network' || error.detail.kind === 'timeout') {
    return true;
  }
  if (error.detail.kind === 'problem') {
    return retryableStatuses.has(error.detail.problem.status);
  }

  return false;
}

/** 서버 확인 없는 mutation 반복을 막기 위해 항상 자동 재시도를 거부한다 */
export function shouldRetryMutation() {
  return false as const;
}
