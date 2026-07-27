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
          payload: {
            questionTypeSlug: 'reading-choice',
            metadata: { second: 2, first: 1 },
          } as never,
        },
        payloadHash: 'a'.repeat(64),
        resultGroup: 'NEEDS_ATTENTION' as const,
        reviewStatus: 'PENDING' as const,
        reviewCode: 'QUESTION_SIMILARITY_REVIEW',
        regeneratedFromCandidateId: null,
        approvedQuestionId: null,
        approvedQuestionVersionId: null,
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

describe('AI 문제 제작 Drizzle 저장소', () => {
  const reviewCommand = {
    candidateId: 'candidate-id',
    expectedRevision: 0,
    actorUserId: 'actor-user-id',
    actorSub: 'actor-sub',
    requestId: 'request-id',
    occurredAt: new Date('2026-07-27T02:00:00.000Z'),
  };

  const approvableCandidate = {
    id: reviewCommand.candidateId,
    jobItemId: input.itemId,
    jobAttempt: input.attempt,
    typeVersionId: 'type-version-id',
    topicId: 'topic-id',
    difficulty: 3,
    payload: input.artifacts.candidates[0]!.candidate.payload,
    resultGroup: 'NORMAL',
    reviewStatus: 'PENDING',
    revision: 0,
    approvedQuestionId: null,
    approvedQuestionVersionId: null,
  };

  it('NORMAL과 네 필수 검증 PASSED 후보만 row lock 뒤 DRAFT로 승인한다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([approvableCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const validationWhere = vi.fn().mockResolvedValue([
      { stage: 'SCHEMA', status: 'PASSED' },
      { stage: 'DECISION_RULE', status: 'PASSED' },
      { stage: 'SIMILARITY', status: 'PASSED' },
      { stage: 'AI_CROSS_VALIDATION', status: 'PASSED' },
    ]);
    const validationFrom = vi.fn(() => ({ where: validationWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: validationFrom });
    const candidateReturning = vi
      .fn()
      .mockResolvedValue([{ id: reviewCommand.candidateId }]);
    const candidateUpdateWhere = vi.fn(() => ({
      returning: candidateReturning,
    }));
    const candidateSet = vi.fn(() => ({ where: candidateUpdateWhere }));
    const update = vi.fn(() => ({ set: candidateSet }));
    const auditValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values: auditValues }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, select, update }),
    );
    const createDraft = vi.fn().mockResolvedValue({
      questionId: 'question-id',
      questionVersionId: 'version-id',
    });
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => reviewCommand.occurredAt,
      { createDraft },
    );

    await expect(repository.approve(reviewCommand)).resolves.toEqual({
      kind: 'APPROVED',
      questionId: 'question-id',
      questionVersionId: 'version-id',
    });
    expect(candidateFor).toHaveBeenCalledWith('update');
    expect(createDraft).toHaveBeenCalledOnce();
    const draftInput: unknown = createDraft.mock.calls[0]?.[1];
    expect(draftInput).toMatchObject({
      candidate: {
        id: reviewCommand.candidateId,
        payload: approvableCandidate.payload,
      },
      actor: {
        actorUserId: reviewCommand.actorUserId,
        requestId: reviewCommand.requestId,
      },
    });
    expect(candidateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewStatus: 'APPROVED',
        approvedQuestionId: 'question-id',
        approvedQuestionVersionId: 'version-id',
        revision: 1,
      }),
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'QUESTION_CANDIDATE_APPROVED',
        targetId: reviewCommand.candidateId,
        requestId: reviewCommand.requestId,
        summary: {
          previousRevision: 0,
          revision: 1,
          questionId: 'question-id',
          questionVersionId: 'version-id',
        },
      }),
    );
  });

  it('필수 검증 하나가 없거나 실패한 후보는 DRAFT를 만들지 않는다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([approvableCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const validationWhere = vi.fn().mockResolvedValue([
      { stage: 'SCHEMA', status: 'PASSED' },
      { stage: 'DECISION_RULE', status: 'PASSED' },
      { stage: 'SIMILARITY', status: 'FAILED' },
    ]);
    const validationFrom = vi.fn(() => ({ where: validationWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: validationFrom });
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ select }),
    );
    const createDraft = vi.fn();
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => reviewCommand.occurredAt,
      { createDraft },
    );

    await expect(repository.approve(reviewCommand)).rejects.toThrow(
      'QUESTION_CANDIDATE_NOT_APPROVABLE',
    );
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('승인 후보의 같은 request replay만 기존 연결을 반환한다', async () => {
    const approved = {
      ...approvableCandidate,
      reviewStatus: 'APPROVED',
      revision: 1,
      approvedQuestionId: 'question-id',
      approvedQuestionVersionId: 'version-id',
    };
    const candidateLimit = vi.fn().mockResolvedValue([approved]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([
      {
        summary: {
          questionId: 'question-id',
          questionVersionId: 'version-id',
        },
      },
    ]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom });
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ select }),
    );
    const createDraft = vi.fn();
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => reviewCommand.occurredAt,
      { createDraft },
    );

    await expect(repository.approve(reviewCommand)).resolves.toEqual({
      kind: 'ALREADY_APPROVED',
      questionId: 'question-id',
      questionVersionId: 'version-id',
    });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('폐기된 후보와 승인된 후보의 다른 terminal 전이를 거절한다', async () => {
    const rows = [
      { ...approvableCandidate, reviewStatus: 'DISCARDED', revision: 1 },
      {
        ...approvableCandidate,
        reviewStatus: 'APPROVED',
        revision: 1,
        approvedQuestionId: 'question-id',
        approvedQuestionVersionId: 'version-id',
      },
    ];
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) => {
        const limit = vi.fn().mockResolvedValue([rows.shift()]);
        const forUpdate = vi.fn(() => ({ limit }));
        const where = vi.fn(() => ({ for: forUpdate }));
        const from = vi.fn(() => ({ where }));
        return callback({ select: vi.fn(() => ({ from })) });
      },
    );
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => reviewCommand.occurredAt,
      { createDraft: vi.fn() },
    );

    await expect(repository.approve(reviewCommand)).resolves.toEqual({
      kind: 'CONFLICT',
    });
    await expect(repository.discard(reviewCommand)).resolves.toBe(false);
  });

  it('재생성은 같은 item의 attempt를 증가시키고 원본 후보 lineage를 보존한다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([approvableCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const itemLimit = vi
      .fn()
      .mockResolvedValue([
        { id: input.itemId, jobId: input.jobId, attempt: input.attempt },
      ]);
    const itemFor = vi.fn(() => ({ limit: itemLimit }));
    const itemWhere = vi.fn(() => ({ for: itemFor }));
    const itemFrom = vi.fn(() => ({ where: itemWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom })
      .mockReturnValueOnce({ from: itemFrom });
    const returning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const auditValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values: auditValues }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, select, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => reviewCommand.occurredAt,
      { createDraft: vi.fn() },
    );

    await expect(
      repository.requestRegeneration(reviewCommand),
    ).resolves.toEqual({ jobId: input.jobId, attempt: input.attempt + 1 });
    expect(itemFor).toHaveBeenCalledWith('update');
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: input.attempt + 1,
        status: 'PENDING',
        result: {
          regeneratedFromCandidateId: reviewCommand.candidateId,
        },
      }),
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'QUESTION_CANDIDATE_REGENERATION_REQUESTED',
        summary: {
          jobId: input.jobId,
          attempt: input.attempt + 1,
          regeneratedFromCandidateId: reviewCommand.candidateId,
        },
      }),
    );
  });

  it('성공한 문제 provider 실행은 문제 후보 결과로 replay한다', async () => {
    const activeLimit = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const activeFor = vi.fn(() => ({ limit: activeLimit }));
    const activeWhere = vi.fn(() => ({ for: activeFor }));
    const activeFrom = vi.fn(() => ({ where: activeWhere }));
    const runLimit = vi.fn().mockResolvedValue([
      {
        id: 'run-id',
        status: 'SUCCEEDED',
        result: { kind: 'QUESTION_CANDIDATES', candidates: [] },
        itemLeaseToken: input.leaseToken,
      },
    ]);
    const runWhere = vi.fn(() => ({ limit: runLimit }));
    const runFrom = vi.fn(() => ({ where: runWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: activeFrom })
      .mockReturnValueOnce({ from: runFrom });
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ select }),
    );
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction,
    } as never);

    await expect(
      repository.claim({
        jobItemId: input.itemId,
        jobAttempt: input.attempt,
        operation: 'QUESTION_GENERATION',
        sequence: 0,
        provider: 'LOCAL_FAKE',
        model: 'question-generation-v1',
        promptVersion: 'question-generation-v1',
        itemLeaseToken: input.leaseToken,
      }),
    ).resolves.toEqual({
      kind: 'REPLAY',
      result: { kind: 'QUESTION_CANDIDATES', candidates: [] },
    });
  });

  it('문제 provider 성공 metadata와 normalized 결과를 분리 저장한다', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'run-id' }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const repository = new DrizzleAiQuestionProductionRepository({
      update,
    } as never);

    await repository.succeed('run-id', {
      kind: 'QUESTION_CANDIDATES',
      candidates: [],
      usage: { inputTokens: 12 },
      estimatedCostUsd: '0.001000',
      providerRequestId: 'provider-request-id',
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        result: { kind: 'QUESTION_CANDIDATES', candidates: [] },
        usage: { inputTokens: 12 },
        estimatedCostUsd: '0.001000',
        providerRequestId: 'provider-request-id',
      }),
    );
  });

  it('이전 lease의 STARTED 문제 provider 실행을 결과 불명으로 닫는다', async () => {
    const activeLimit = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const activeFor = vi.fn(() => ({ limit: activeLimit }));
    const activeWhere = vi.fn(() => ({ for: activeFor }));
    const activeFrom = vi.fn(() => ({ where: activeWhere }));
    const runLimit = vi.fn().mockResolvedValue([
      {
        id: 'run-id',
        status: 'STARTED',
        result: null,
        itemLeaseToken: 'old-lease-token',
      },
    ]);
    const runWhere = vi.fn(() => ({ limit: runLimit }));
    const runFrom = vi.fn(() => ({ where: runWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: activeFrom })
      .mockReturnValueOnce({ from: runFrom });
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ select, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction,
    } as never);

    await expect(
      repository.claim({
        jobItemId: input.itemId,
        jobAttempt: input.attempt,
        operation: 'QUESTION_GENERATION',
        sequence: 0,
        provider: 'LOCAL_FAKE',
        model: 'question-generation-v1',
        promptVersion: 'question-generation-v1',
        itemLeaseToken: input.leaseToken,
      }),
    ).resolves.toEqual({ kind: 'OUTCOME_UNKNOWN' });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'OUTCOME_UNKNOWN',
        errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      }),
    );
  });

  it('새 후보의 검토·승인 연결 상태를 빠짐없이 저장한다', async () => {
    const candidateReturning = vi
      .fn()
      .mockResolvedValue([{ id: 'candidate-id', ordinal: 0 }]);
    const candidateConflict = vi.fn(() => ({ returning: candidateReturning }));
    const candidateValues = vi.fn(() => ({
      onConflictDoNothing: candidateConflict,
    }));
    const validationReturning = vi
      .fn()
      .mockResolvedValue([{ id: 'validation-id' }]);
    const validationConflict = vi.fn(() => ({
      returning: validationReturning,
    }));
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
    expect(candidateValues).toHaveBeenCalledWith([
      expect.objectContaining({
        reviewStatus: 'PENDING',
        regeneratedFromCandidateId: null,
        approvedQuestionId: null,
        approvedQuestionVersionId: null,
      }),
    ]);
    expect(candidateConflict).toHaveBeenCalledOnce();
    expect(validationConflict).toHaveBeenCalledOnce();
    expect(terminalSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'NEEDS_ATTENTION', leaseToken: null }),
    );
  });

  it('재생성 item 결과의 원본 후보를 새 attempt 후보 lineage로 옮긴다', async () => {
    const candidateReturning = vi
      .fn()
      .mockResolvedValue([{ id: 'new-candidate-id', ordinal: 0 }]);
    const candidateConflict = vi.fn(() => ({ returning: candidateReturning }));
    const values = vi.fn(() => ({
      onConflictDoNothing: candidateConflict,
    }));
    const validationReturning = vi
      .fn()
      .mockResolvedValue([{ id: 'validation-id' }]);
    const validationConflict = vi.fn(() => ({
      returning: validationReturning,
    }));
    const validationValues = vi.fn(() => ({
      onConflictDoNothing: validationConflict,
    }));
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values })
      .mockReturnValueOnce({ values: validationValues });
    const terminalReturning = vi.fn().mockResolvedValue([
      {
        id: input.itemId,
        result: { regeneratedFromCandidateId: 'original-candidate-id' },
      },
    ]);
    const terminalWhere = vi.fn(() => ({ returning: terminalReturning }));
    const terminalSet = vi.fn(() => ({ where: terminalWhere }));
    const update = vi.fn(() => ({ set: terminalSet }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction,
    } as never);

    await expect(repository.persist(input)).resolves.toBe(true);
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({
        regeneratedFromCandidateId: 'original-candidate-id',
      }),
    ]);
  });

  it('같은 candidate와 validation replay는 fallback 조회 후 성공한다', async () => {
    const candidateReturning = vi.fn().mockResolvedValue([]);
    const candidateConflict = vi.fn(() => ({ returning: candidateReturning }));
    const candidateValues = vi.fn(() => ({
      onConflictDoNothing: candidateConflict,
    }));
    const validationReturning = vi.fn().mockResolvedValue([]);
    const validationConflict = vi.fn(() => ({
      returning: validationReturning,
    }));
    const validationValues = vi.fn(() => ({
      onConflictDoNothing: validationConflict,
    }));
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: candidateValues })
      .mockReturnValueOnce({ values: validationValues });
    const limit = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'candidate-id',
          ordinal: 0,
          typeVersionId: 'type-version-id',
          topicId: 'topic-id',
          difficulty: 3,
          payload: {
            metadata: { first: 1, second: 2 },
            questionTypeSlug: 'reading-choice',
          },
          payloadHash: 'a'.repeat(64),
          resultGroup: 'NEEDS_ATTENTION',
          reviewStatus: 'PENDING',
          reviewCode: 'QUESTION_SIMILARITY_REVIEW',
          regeneratedFromCandidateId: null,
          approvedQuestionId: null,
          approvedQuestionVersionId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'validation-id',
          status: 'FAILED',
          code: 'QUESTION_SIMILARITY_REVIEW',
          details: { score: 0.93 },
        },
      ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn((projection: unknown) => {
      void projection;
      return { from };
    });
    const terminalReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const terminalWhere = vi.fn(() => ({ returning: terminalReturning }));
    const terminalSet = vi.fn(() => ({ where: terminalWhere }));
    const update = vi.fn(() => ({ set: terminalSet }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, select, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => new Date('2026-07-27T01:00:00.000Z'),
    );

    await expect(repository.persist(input)).resolves.toBe(true);
    expect(limit).toHaveBeenCalledTimes(2);
  });

  it('같은 ordinal의 payload hash가 다르면 replay 충돌로 transaction을 실패시킨다', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const limit = vi.fn().mockResolvedValue([
      {
        id: 'candidate-id',
        ordinal: 0,
        typeVersionId: 'type-version-id',
        topicId: 'topic-id',
        difficulty: 3,
        payload: { questionTypeSlug: 'reading-choice' },
        payloadHash: 'b'.repeat(64),
        resultGroup: 'NEEDS_ATTENTION',
        reviewStatus: 'PENDING',
        reviewCode: 'QUESTION_SIMILARITY_REVIEW',
        regeneratedFromCandidateId: null,
        approvedQuestionId: null,
        approvedQuestionVersionId: null,
      },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn((projection: unknown) => {
      void projection;
      return { from };
    });
    const terminalReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const terminalWhere = vi.fn(() => ({ returning: terminalReturning }));
    const terminalSet = vi.fn(() => ({ where: terminalWhere }));
    const update = vi.fn(() => ({ set: terminalSet }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, select, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction,
    } as never);

    await expect(repository.persist(input)).rejects.toThrow(
      'QUESTION_CANDIDATE_REPLAY_CONFLICT',
    );
  });

  it('같은 payload hash라도 canonical payload가 다르면 replay 충돌로 실패한다', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const limit = vi.fn().mockResolvedValue([
      {
        id: 'candidate-id',
        ordinal: 0,
        typeVersionId: 'type-version-id',
        topicId: 'topic-id',
        difficulty: 3,
        payload: { questionTypeSlug: 'different-question' },
        payloadHash: 'a'.repeat(64),
        resultGroup: 'NEEDS_ATTENTION',
        reviewStatus: 'PENDING',
        reviewCode: 'QUESTION_SIMILARITY_REVIEW',
        regeneratedFromCandidateId: null,
        approvedQuestionId: null,
        approvedQuestionVersionId: null,
      },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn((projection: unknown) => {
      void projection;
      return { from };
    });
    const terminalReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const terminalWhere = vi.fn(() => ({ returning: terminalReturning }));
    const terminalSet = vi.fn(() => ({ where: terminalWhere }));
    const update = vi.fn(() => ({ set: terminalSet }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, select, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction,
    } as never);

    await expect(repository.persist(input)).rejects.toThrow(
      'QUESTION_CANDIDATE_REPLAY_CONFLICT',
    );
    const selectedProjection: unknown = select.mock.calls[0]?.[0];
    expect(
      typeof selectedProjection === 'object' &&
        selectedProjection !== null &&
        Object.hasOwn(selectedProjection, 'payload'),
    ).toBe(true);
  });

  it('같은 validation stage의 details가 다르면 replay 충돌로 실패한다', async () => {
    const candidateReturning = vi
      .fn()
      .mockResolvedValue([{ id: 'candidate-id', ordinal: 0 }]);
    const candidateConflict = vi.fn(() => ({ returning: candidateReturning }));
    const candidateValues = vi.fn(() => ({
      onConflictDoNothing: candidateConflict,
    }));
    const validationReturning = vi.fn().mockResolvedValue([]);
    const validationConflict = vi.fn(() => ({
      returning: validationReturning,
    }));
    const validationValues = vi.fn(() => ({
      onConflictDoNothing: validationConflict,
    }));
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: candidateValues })
      .mockReturnValueOnce({ values: validationValues });
    const limit = vi.fn().mockResolvedValue([
      {
        id: 'validation-id',
        status: 'FAILED',
        code: 'QUESTION_SIMILARITY_REVIEW',
        details: { score: 0.5 },
      },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const terminalReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const terminalWhere = vi.fn(() => ({ returning: terminalReturning }));
    const terminalSet = vi.fn(() => ({ where: terminalWhere }));
    const update = vi.fn(() => ({ set: terminalSet }));
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, select, update }),
    );
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction,
    } as never);

    await expect(repository.persist(input)).rejects.toThrow(
      'QUESTION_VALIDATION_REPLAY_CONFLICT',
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
