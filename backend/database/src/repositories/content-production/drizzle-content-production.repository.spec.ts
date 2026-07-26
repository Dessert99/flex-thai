/** Drizzle 콘텐츠 제작 adapter가 stale 상태 전이를 성공처럼 처리하지 않는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { DrizzleContentProductionRepository } from './drizzle-content-production.repository.js';

describe('DrizzleContentProductionRepository 조건부 전이', () => {
  it('구조화된 item seed의 input과 operation을 row에 보존한다', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockResolvedValue([{ attempt: 0 }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const repository = new DrizzleContentProductionRepository({
      insert,
      select,
    } as never);

    await repository.ensureItems('job-id', [
      {
        sourceRef: 'opaque',
        jobInputId: 'input-id',
        operation: 'VOCABULARY_EXTRACTION',
      },
    ]);

    expect(values).toHaveBeenCalledWith([
      {
        jobId: 'job-id',
        sourceRef: 'opaque',
        jobInputId: 'input-id',
        operation: 'VOCABULARY_EXTRACTION',
        attempt: 0,
      },
    ]);
  });

  it('legacy Job의 unique 충돌을 콘텐츠 제작 멱등 충돌로 반환한다', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const limit = vi.fn().mockResolvedValue([
      {
        id: '405986f9-e552-4ce1-82d6-70a1fc460f96',
        requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        type: 'VOCAB_IMPORT',
        purpose: null,
        presetId: null,
        presetSnapshot: null,
        status: 'QUEUED',
        attempt: 0,
        enqueuedAt: null,
        completedAt: null,
        failureCode: null,
        createdAt: new Date('2026-07-17T00:00:00.000Z'),
        updatedAt: new Date('2026-07-17T00:00:00.000Z'),
      },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, select }),
    );
    const repository = new DrizzleContentProductionRepository({
      transaction,
    } as never);

    await expect(
      repository.createOrFind({
        requestedBy: '8f47b4d5-97d6-4596-af72-16456be51be8',
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        purpose: 'QUESTION_GENERATION',
        presetSnapshot: {
          id: 'a9979e5d-515d-43ab-a380-e88b78513c38',
          name: '기본 문제 생성',
          purpose: 'QUESTION_GENERATION',
          version: 1,
          parameters: { language: 'th' },
        },
        inputs: [
          {
            uploadId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
            inputType: 'TEXT',
            inputKey: 'inputs/a.txt',
            sizeBytes: 10,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'CONTENT_PRODUCTION_IDEMPOTENCY_CONFLICT',
    });
  });

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
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ update }),
    );
    const repository = new DrizzleContentProductionRepository({
      transaction,
    } as never);

    await expect(
      repository.finishItem('job-id', 'item-id', 0, 'lease-token', {
        status: 'FAILED',
        retryable: true,
        errorCode: 'LOCAL_FAKE_FAILURE',
      }),
    ).resolves.toBe(false);
  });

  it('stale lease면 AI 후보와 terminal 결과를 모두 저장하지 않는다', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const insert = vi.fn();
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, update }),
    );
    const repository = new DrizzleContentProductionRepository({
      transaction,
    } as never);

    await expect(
      repository.finishItem('job-id', 'item-id', 1, 'stale-token', {
        status: 'SUCCEEDED',
        retryable: false,
        errorCode: null,
        artifacts: {
          kind: 'VOCABULARY_CANDIDATES',
          candidates: [],
          validations: [],
        },
      }),
    ).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('현재 QUEUED 또는 RUNNING attempt가 아니면 failure marker를 무시한다', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ update }),
    );
    const repository = new DrizzleContentProductionRepository({
      transaction,
    } as never);

    await expect(
      repository.failAttempt(
        '00000000-0000-4000-8000-000000000001',
        1,
        'CONTENT_PRODUCTION_WORKFLOW_FAILURE',
      ),
    ).resolves.toBeNull();
    expect(update).toHaveBeenCalledOnce();
  });

  it('현재 QUEUED 또는 RUNNING attempt의 unfinished 항목과 Job을 FAILED로 닫는다', async () => {
    const jobReturning = vi
      .fn()
      .mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000001' }]);
    const jobWhere = vi.fn(() => ({ returning: jobReturning }));
    const jobSet = vi.fn(() => ({ where: jobWhere }));
    const itemWhere = vi.fn().mockResolvedValue(undefined);
    const itemSet = vi.fn(() => ({ where: itemWhere }));
    const update = vi
      .fn()
      .mockImplementationOnce(() => ({ set: jobSet }))
      .mockImplementationOnce(() => ({ set: itemSet }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ update }),
    );
    const repository = new DrizzleContentProductionRepository(
      { transaction } as never,
      () => new Date('2026-07-27T00:00:00.000Z'),
    );

    await expect(
      repository.failAttempt(
        '00000000-0000-4000-8000-000000000001',
        1,
        'CONTENT_PRODUCTION_WORKFLOW_FAILURE',
      ),
    ).resolves.toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
      status: 'FAILED',
    });
    expect(jobSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        failureCode: 'CONTENT_PRODUCTION_WORKFLOW_FAILURE',
      }),
    );
    expect(itemSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        retryable: true,
        errorCode: 'CONTENT_PRODUCTION_WORKFLOW_FAILURE',
        leaseUntil: null,
        leaseToken: null,
      }),
    );
  });
});
