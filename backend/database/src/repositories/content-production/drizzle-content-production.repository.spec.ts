/** Drizzle 콘텐츠 제작 adapter가 stale 상태 전이를 성공처럼 처리하지 않는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleContentProductionRepository } from './drizzle-content-production.repository.js';

describe('DrizzleContentProductionRepository 조건부 전이', () => {
  it('이미 claim된 attempt는 stale 재전달로 보고 null을 반환한다', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const limit = vi.fn().mockResolvedValue([]);
    const selectWhere = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: selectWhere }));
    const select = vi.fn(() => ({ from }));
    const repository = new DrizzleContentProductionRepository({
      update,
      select,
    } as never);

    await expect(repository.startAttempt('job-id', 0)).resolves.toBeNull();
  });

  it('다른 attempt가 끝낸 항목 결과는 false를 반환한다', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const repository = new DrizzleContentProductionRepository({
      update,
    } as never);

    await expect(
      repository.finishItem('job-id', 'item-id', 0, {
        status: 'FAILED',
        retryable: true,
        errorCode: 'LOCAL_FAKE_FAILURE',
      }),
    ).resolves.toBe(false);
  });
});
