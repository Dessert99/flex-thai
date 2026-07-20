/** Data API migration의 로그와 client 정리 경계를 검증한다 */
import { describe, expect, it } from 'vitest';

import { runDataApiMigration } from './run-data-api-migration.js';

describe('runDataApiMigration', () => {
  it('migration 성공을 기록하고 client를 정리한다', async () => {
    const events: string[] = [];

    await runDataApiMigration({
      migrate: () => {
        events.push('migrate');
        return Promise.resolve();
      },
      destroy: () => {
        events.push('destroy');
      },
      onSuccess: () => {
        events.push('success');
      },
      onError: () => {
        events.push('error');
      },
    });

    expect(events).toEqual(['migrate', 'success', 'destroy']);
  });

  it('migration 실패 원본을 기록하고 client를 정리한 뒤 다시 반환한다', async () => {
    const failure = new Error('migration 실패');
    const events: string[] = [];
    let loggedError: unknown;

    const result = runDataApiMigration({
      migrate: () => {
        events.push('migrate');
        return Promise.reject(failure);
      },
      destroy: () => {
        events.push('destroy');
      },
      onSuccess: () => {
        events.push('success');
      },
      onError: (error) => {
        events.push('error');
        loggedError = error;
      },
    });

    await expect(result).rejects.toBe(failure);
    expect(loggedError).toBe(failure);
    expect(events).toEqual(['migrate', 'error', 'destroy']);
  });
});
