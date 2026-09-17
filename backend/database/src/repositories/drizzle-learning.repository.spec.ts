import { describe, expect, it, vi } from 'vitest';
import { DrizzleLearningRepository } from './drizzle-learning.repository.js';
describe('풀이 저장 사용자 잠금', () => {
  it('비활성 또는 없는 사용자에게 풀이 트랜잭션을 열지 않는다', async () => {
    const lock = vi.fn(() => Promise.resolve([]));
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: lock }) }) }),
    };
    const database = {
      transaction: async (work: (value: unknown) => Promise<unknown>) =>
        work(tx),
    };
    const work = vi.fn();
    await expect(
      new DrizzleLearningRepository(database as never).runInTransaction(
        'user',
        work,
      ),
    ).rejects.toMatchObject({ code: 'LEARNING_PERSISTENCE_CONFLICT' });
    expect(lock).toHaveBeenCalledWith('update');
    expect(work).not.toHaveBeenCalled();
  });
});
