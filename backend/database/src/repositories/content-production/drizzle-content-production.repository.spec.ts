/** Drizzle 콘텐츠 제작 adapter가 stale 상태 전이를 성공처럼 처리하지 않는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ContentProductionPresetError } from '@flex-thia/domain';
import {
  DrizzleContentProductionPresetCatalog,
  DrizzleContentProductionRepository,
} from './drizzle-content-production.repository.js';

const queuedSelect = (results: unknown[][]) => {
  const queue = [...results];
  return vi.fn(() => {
    const consume = () => Promise.resolve(queue.shift() ?? []);
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => consume()),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (error: unknown) => unknown,
      ) => consume().then(resolve, reject),
    };
    return chain;
  });
};

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
        questionPlan: null,
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

  it('만료된 lease는 token이 같아도 terminal 결과를 저장하지 않는다', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ update }),
    );
    const now = new Date('2026-07-27T00:05:00.000Z');
    const repository = new DrizzleContentProductionRepository(
      { transaction } as never,
      () => now,
    );

    await repository.finishItem('job-id', 'item-id', 1, 'lease-token', {
      status: 'SUCCEEDED',
      retryable: false,
      errorCode: null,
    });

    const [condition] = where.mock.calls[0] as unknown[];
    const compiled = new PgDialect().sqlToQuery(condition as never);
    expect(compiled.sql).toContain('"job_items"."lease_until" >');
    expect(compiled.params).toContain(now.toISOString());
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

describe('DrizzleContentProductionPresetCatalog version 운영', () => {
  const preset = {
    id: '405986f9-e552-4ce1-82d6-70a1fc460f96',
    name: '문제 생성',
    purpose: 'QUESTION_GENERATION' as const,
    version: 2,
    parameters: { commonPrinciples: ['FLEX'] },
    enabled: true,
    createdAt: new Date('2026-07-28T00:00:00.000Z'),
  };

  it('enable audit row 수를 immutable preset revision으로 계산한다', async () => {
    const select = queuedSelect([
      [preset],
      [{ targetId: preset.id }, { targetId: preset.id }],
    ]);
    const catalog = new DrizzleContentProductionPresetCatalog({
      select,
    } as never);

    await expect(catalog.listVersions()).resolves.toEqual([
      { ...preset, revision: 2 },
    ]);
  });

  it('활성 taxonomy·어휘·voice 참조가 모두 유효할 때만 job options를 overlay한다', async () => {
    const typeVersionId = 'cbb22737-6f3d-4112-bb0e-8e4f005c810b';
    const vocabularyId = '77a1e8ff-7c85-4739-9004-647e12e34b65';
    const voicePresetId = 'a9979e5d-515d-43ab-a380-e88b78513c38';
    const select = queuedSelect([
      [preset],
      [{ id: typeVersionId }],
      [{ id: vocabularyId }],
      [{ id: voicePresetId }],
    ]);
    const catalog = new DrizzleContentProductionPresetCatalog({
      select,
    } as never);
    const options = {
      questionCount: 1,
      questionTypePlan: [{ questionTypeVersionId: typeVersionId, count: 1 }],
      difficultyPlan: [{ difficulty: 2, count: 1 }],
      targetVocabularyIds: [vocabularyId],
      requiredVocabularyIds: [],
      excludedVocabularyIds: [],
      newAuxiliaryVocabularyLimit: 0,
      similarityThreshold: 0.7,
      defaultVoicePresetId: voicePresetId,
      speakerVoiceAssignments: [],
      additionalInstructionKo: null,
    };

    await expect(
      catalog.resolveEffectiveSnapshot({
        purpose: 'QUESTION_GENERATION',
        presetId: preset.id,
        options,
      }),
    ).resolves.toMatchObject({
      id: preset.id,
      parameters: {
        commonPrinciples: ['FLEX'],
        ...options,
      },
    });
  });

  it('enabled command exact replay는 같은 결과를 반환하고 다른 command는 충돌한다', async () => {
    const replayAudit = {
      action: 'CONTENT_PRODUCTION_PRESET_ENABLED_CHANGED',
      targetId: preset.id,
      summary: {
        presetId: preset.id,
        enabled: false,
        expectedRevision: 0,
      },
    };
    const command = {
      presetId: preset.id,
      enabled: false,
      expectedRevision: 0,
      requestId: 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6',
      actorUserId: '8f47b4d5-97d6-4596-af72-16456be51be8',
      actorSub: 'subject',
      occurredAt: new Date('2026-07-28T00:01:00.000Z'),
    };
    const createDatabase = () => {
      const select = queuedSelect([[replayAudit], [preset]]);
      return {
        execute: vi.fn(),
        select,
      };
    };
    const exactTransaction = createDatabase();
    const exact = new DrizzleContentProductionPresetCatalog({
      transaction: (operation: (transaction: unknown) => Promise<unknown>) =>
        operation(exactTransaction),
    } as never);
    await expect(exact.setEnabled(command)).resolves.toEqual({
      ...preset,
      enabled: false,
      revision: 1,
    });

    const conflictTransaction = createDatabase();
    const conflict = new DrizzleContentProductionPresetCatalog({
      transaction: (operation: (transaction: unknown) => Promise<unknown>) =>
        operation(conflictTransaction),
    } as never);
    await expect(
      conflict.setEnabled({ ...command, enabled: true }),
    ).rejects.toEqual(
      new ContentProductionPresetError(
        'CONTENT_PRODUCTION_PRESET_IDEMPOTENCY_CONFLICT',
      ),
    );
  });

  it('현재 enable audit revision과 expected revision이 다르면 갱신하지 않는다', async () => {
    const transaction = {
      execute: vi.fn(),
      select: queuedSelect([[], [preset], [{ id: 'audit-id' }]]),
      update: vi.fn(),
    };
    const catalog = new DrizzleContentProductionPresetCatalog({
      transaction: (operation: (input: unknown) => Promise<unknown>) =>
        operation(transaction),
    } as never);

    await expect(
      catalog.setEnabled({
        presetId: preset.id,
        enabled: false,
        expectedRevision: 0,
        requestId: 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6',
        actorUserId: '8f47b4d5-97d6-4596-af72-16456be51be8',
        actorSub: 'subject',
        occurredAt: new Date('2026-07-28T00:01:00.000Z'),
      }),
    ).rejects.toEqual(
      new ContentProductionPresetError(
        'CONTENT_PRODUCTION_PRESET_REVISION_CONFLICT',
      ),
    );
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('repository 직접 호출도 purpose와 parameters 불일치를 저장하지 않는다', async () => {
    const transaction = vi.fn();
    const catalog = new DrizzleContentProductionPresetCatalog({
      transaction,
    } as never);

    await expect(
      catalog.createInitial({
        requestId: 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6',
        actorUserId: '8f47b4d5-97d6-4596-af72-16456be51be8',
        actorSub: 'subject',
        occurredAt: new Date('2026-07-28T00:01:00.000Z'),
        name: '잘못된 preset',
        purpose: 'VOCABULARY_EXTRACTION',
        parameters: {
          questionCount: 1,
        },
      }),
    ).rejects.toMatchObject({
      code: 'CONTENT_PRODUCTION_PRESET_PURPOSE_MISMATCH',
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
