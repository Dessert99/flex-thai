import { describe, expect, it, vi } from 'vitest';
import { DrizzleAdminQuestionQuery } from './drizzle-admin-question.query.js';
describe('관리자 현재 문제 조회', () => {
  it('문제가 없으면 어휘 연결을 조회하지 않는다', async () => {
    const select = vi.fn(() => ({
      from: () => ({ where: () => Promise.resolve([]) }),
    }));
    const query = new DrizzleAdminQuestionQuery({ select } as never);
    expect(await query.findById('missing')).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });
});
