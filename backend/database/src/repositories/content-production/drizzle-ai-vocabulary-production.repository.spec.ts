/** AI 어휘 provider 실행이 같은 attempt에서 중복 호출되지 않는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleAiVocabularyProductionRepository } from './drizzle-ai-vocabulary-production.repository.js';

const execution = {
  jobItemId: '00000000-0000-4000-8000-000000000001',
  jobAttempt: 1,
  operation: 'VOCABULARY_EXTRACTION',
  sequence: 0,
  provider: 'LOCAL_FAKE',
  model: 'deterministic-v1',
  promptVersion: 'v1',
  itemLeaseToken: 'new-lease-token',
};

describe('DrizzleAiVocabularyProductionRepository provider 수명', () => {
  it('성공한 실행은 normalized 결과를 replay한다', async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: 'run-id',
        status: 'SUCCEEDED',
        result: { kind: 'TEXT', text: '저장 결과' },
      },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ select }),
    );
    const repository = new DrizzleAiVocabularyProductionRepository({
      transaction,
    } as never);

    await expect(repository.claim(execution)).resolves.toEqual({
      kind: 'REPLAY',
      result: { kind: 'TEXT', text: '저장 결과' },
    });
  });

  it('STARTED 실행이 남아 있으면 outcome unknown으로 닫고 재호출을 막는다', async () => {
    const limit = vi.fn().mockResolvedValueOnce([
      {
        id: 'run-id',
        status: 'STARTED',
        result: null,
        itemLeaseToken: 'old-lease-token',
      },
    ]);
    const selectWhere = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: selectWhere }));
    const select = vi.fn(() => ({ from }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ select, update }),
    );
    const repository = new DrizzleAiVocabularyProductionRepository({
      transaction,
    } as never);

    await expect(repository.claim(execution)).resolves.toEqual({
      kind: 'OUTCOME_UNKNOWN',
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'OUTCOME_UNKNOWN',
        errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      }),
    );
  });

  it('같은 lease의 중복 호출은 실행 상태를 바꾸지 않고 재호출만 막는다', async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: 'run-id',
        status: 'STARTED',
        result: null,
        itemLeaseToken: 'new-lease-token',
      },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const update = vi.fn();
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ select, update }),
    );
    const repository = new DrizzleAiVocabularyProductionRepository({
      transaction,
    } as never);

    await expect(repository.claim(execution)).resolves.toEqual({
      kind: 'OUTCOME_UNKNOWN',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('실행 key가 없으면 STARTED row를 만들고 소유권을 반환한다', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const returning = vi.fn().mockResolvedValue([{ id: 'new-run-id' }]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, select }),
    );
    const repository = new DrizzleAiVocabularyProductionRepository({
      transaction,
    } as never);

    await expect(repository.claim(execution)).resolves.toEqual({
      kind: 'CLAIMED',
      runId: 'new-run-id',
    });
  });
});
