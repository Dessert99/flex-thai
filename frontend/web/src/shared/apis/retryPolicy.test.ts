/** Query와 mutation의 재시도 가능 오류 경계를 검증한다 */
import { describe, expect, it } from 'vitest';
import { ApiError } from './ApiError';
import { shouldRetryMutation, shouldRetryQuery } from './retryPolicy';

describe('Query 재시도 정책', () => {
  it.each([
    new ApiError({ kind: 'network' }),
    new ApiError({ kind: 'timeout' }),
    createProblemError(502),
    createProblemError(503),
    createProblemError(504),
  ])('일시적인 오류는 최초 실패에서만 재시도한다', (error) => {
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(false);
  });

  it.each([
    createProblemError(400),
    createProblemError(401),
    createProblemError(403),
    createProblemError(404),
    createProblemError(500),
    new ApiError({ kind: 'invalid-response' }),
    new ApiError({ kind: 'cancelled' }),
    new Error('unknown'),
  ])('영구적이거나 분류되지 않은 오류는 재시도하지 않는다', (error) => {
    expect(shouldRetryQuery(0, error)).toBe(false);
  });
});

describe('Mutation 재시도 정책', () => {
  it('오류 종류와 관계없이 자동 재시도하지 않는다', () => {
    expect(shouldRetryMutation()).toBe(false);
  });
});

function createProblemError(status: number) {
  return new ApiError({
    kind: 'problem',
    problem: {
      type: 'https://flex-thia.dev/problems/request-failed',
      title: '요청 실패',
      status,
      code: `HTTP_${status}`,
      requestId: `request-${status}`,
      fieldErrors: [],
    },
  });
}
