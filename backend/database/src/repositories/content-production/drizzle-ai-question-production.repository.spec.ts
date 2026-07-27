/** AI 문제 후보 artifact가 활성 lease에서만 원자 저장되는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleAiQuestionProductionRepository } from './drizzle-ai-question-production.repository.js';

const input = {
  jobId: 'job-id',
  itemId: 'item-id',
  attempt: 2,
  leaseToken: 'lease-token',
  outcome: {
    status: 'NEEDS_ATTENTION' as const,
    retryable: false,
    errorCode: null,
    result: { total: 1 },
  },
  artifacts: {
    kind: 'QUESTION_CANDIDATES' as const,
    candidates: [
      {
        ordinal: 0,
        candidate: {
          questionTypeVersionId: 'type-version-id',
          topicId: 'topic-id',
          tagIds: ['tag-id'],
          difficulty: 3,
          payload: { questionTypeSlug: 'reading-choice' } as never,
        },
        payloadHash: 'a'.repeat(64),
        resultGroup: 'NEEDS_ATTENTION' as const,
        reviewCode: 'QUESTION_SIMILARITY_REVIEW',
      },
    ],
    validations: [
      {
        candidateOrdinal: 0,
        stage: 'SIMILARITY' as const,
        status: 'FAILED' as const,
        code: 'QUESTION_SIMILARITY_REVIEW',
        details: { score: 0.93 },
      },
    ],
  },
};

describe('DrizzleAiQuestionProductionRepository', () => {
  it('같은 item·attempt·ordinal과 validation stage replay를 충돌 없이 저장한다', async () => {
    const candidateReturning = vi
      .fn()
      .mockResolvedValue([{ id: 'candidate-id', ordinal: 0 }]);
    const candidateConflict = vi.fn(() => ({ returning: candidateReturning }));
    const candidateValues = vi.fn(() => ({
      onConflictDoNothing: candidateConflict,
    }));
    const validationConflict = vi.fn().mockResolvedValue(undefined);
    const validationValues = vi.fn(() => ({
      onConflictDoNothing: validationConflict,
    }));
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: candidateValues })
      .mockReturnValueOnce({ values: validationValues });
    const terminalReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const terminalWhere = vi.fn(() => ({ returning: terminalReturning }));
    const terminalSet = vi.fn(() => ({ where: terminalWhere }));
    const update = vi.fn(() => ({ set: terminalSet }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => new Date('2026-07-27T01:00:00.000Z'),
    );

    await expect(repository.persist(input)).resolves.toBe(true);
    expect(candidateConflict).toHaveBeenCalledOnce();
    expect(validationConflict).toHaveBeenCalledOnce();
    expect(terminalSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'NEEDS_ATTENTION', leaseToken: null }),
    );
  });

  it('stale lease면 artifact insert 없이 no-op 처리한다', async () => {
    const terminalReturning = vi.fn().mockResolvedValue([]);
    const terminalWhere = vi.fn(() => ({ returning: terminalReturning }));
    const terminalSet = vi.fn(() => ({ where: terminalWhere }));
    const update = vi.fn(() => ({ set: terminalSet }));
    const insert = vi.fn();
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => new Date('2026-07-27T01:00:00.000Z'),
    );

    await expect(repository.persist(input)).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('artifact insert 실패는 transaction 밖 성공으로 숨기지 않는다', async () => {
    const candidateValues = vi.fn(() => {
      throw new Error('candidate insert failed');
    });
    const insert = vi.fn(() => ({ values: candidateValues }));
    const terminalReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const terminalWhere = vi.fn(() => ({ returning: terminalReturning }));
    const terminalSet = vi.fn(() => ({ where: terminalWhere }));
    const update = vi.fn(() => ({ set: terminalSet }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => new Date('2026-07-27T01:00:00.000Z'),
    );

    await expect(repository.persist(input)).rejects.toThrow(
      'candidate insert failed',
    );
  });
});
