import { describe, expect, it, vi } from 'vitest';
import { DrizzleQuestionAdminRepository } from './drizzle-question-admin.repository.js';
describe('관리자 문제 저장 트랜잭션', () => {
  it('감사 저장 실패를 상위 트랜잭션에 전달한다', async () => {
    const failure = new Error('audit failed');
    const tx = {
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.reject(failure)) })),
    };
    const database = {
      transaction: vi.fn(async (work: (value: unknown) => Promise<unknown>) =>
        work(tx),
      ),
    };
    const repository = new DrizzleQuestionAdminRepository(database as never);
    await expect(
      repository.runInTransaction((transaction) =>
        transaction.appendAuditLog({
          actorSub: 'sub',
          actorUserId: 'user',
          requestId: 'request',
          occurredAt: new Date(),
          action: 'QUESTION_UPDATED',
          targetId: 'question',
          summary: {},
        }),
      ),
    ).rejects.toBe(failure);
  });
});
