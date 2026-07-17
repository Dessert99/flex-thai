/** DB 준비 상태와 Aurora 재개 대기를 구분하는 readiness 테스트 */
import { describe, expect, it } from 'vitest';
import { ReadinessService } from './readiness.service.js';

describe('ReadinessService', () => {
  it('DB probe가 끝나면 ready 상태를 반환한다', async () => {
    const service = new ReadinessService(
      { check: () => Promise.resolve() },
      10,
    );

    await expect(service.check()).resolves.toEqual({ status: 'ready' });
  });

  it('제한 시간 안에 DB가 응답하지 않으면 DB_RESUMING으로 실패한다', async () => {
    const service = new ReadinessService(
      { check: () => new Promise<void>(() => undefined) },
      1,
    );

    await expect(service.check()).rejects.toMatchObject({
      code: 'DB_RESUMING',
    });
  });
});
