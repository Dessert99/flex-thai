/** Aurora 재개 중 오류에만 제한적으로 재시도하는 정책을 검증한다 */
import { DatabaseResumingException } from '@aws-sdk/client-rds-data';
import { describe, expect, it } from 'vitest';

import { waitForDataApi } from './wait-for-data-api.js';

const createResumingError = (): DatabaseResumingException =>
  new DatabaseResumingException({
    $metadata: {},
    message: 'Aurora가 재개 중입니다.',
  });

describe('waitForDataApi', () => {
  it('Aurora 재개 오류 뒤 probe가 성공하면 대기를 끝낸다', async () => {
    let probeCount = 0;
    let sleepCount = 0;
    const retries: number[] = [];

    await waitForDataApi({
      maxAttempts: 3,
      probe: () => {
        probeCount += 1;
        if (probeCount === 1) return Promise.reject(createResumingError());
        return Promise.resolve();
      },
      sleep: () => {
        sleepCount += 1;
        return Promise.resolve();
      },
      onRetry: (attempt) => {
        retries.push(attempt);
      },
    });

    expect(probeCount).toBe(2);
    expect(sleepCount).toBe(1);
    expect(retries).toEqual([1]);
  });

  it('재개 오류가 아니면 기다리지 않고 첫 오류를 반환한다', async () => {
    const accessError = new Error('권한이 없습니다.');
    let probeCount = 0;
    let sleepCount = 0;

    const result = waitForDataApi({
      maxAttempts: 3,
      probe: () => {
        probeCount += 1;
        return Promise.reject(accessError);
      },
      sleep: () => {
        sleepCount += 1;
        return Promise.resolve();
      },
      onRetry: () => undefined,
    });

    await expect(result).rejects.toBe(accessError);
    expect(probeCount).toBe(1);
    expect(sleepCount).toBe(0);
  });

  it('최대 횟수까지 재개 중이면 마지막 오류를 반환한다', async () => {
    const firstError = createResumingError();
    const lastError = createResumingError();
    let probeCount = 0;
    let sleepCount = 0;

    const result = waitForDataApi({
      maxAttempts: 2,
      probe: () => {
        probeCount += 1;
        return Promise.reject(probeCount === 1 ? firstError : lastError);
      },
      sleep: () => {
        sleepCount += 1;
        return Promise.resolve();
      },
      onRetry: () => undefined,
    });

    await expect(result).rejects.toBe(lastError);
    expect(probeCount).toBe(2);
    expect(sleepCount).toBe(1);
  });
});
