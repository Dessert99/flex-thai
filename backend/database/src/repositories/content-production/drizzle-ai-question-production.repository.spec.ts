/** AI 문제 후보 artifact가 활성 lease에서만 원자 저장되는지 검증한다 */
import { PgDialect } from 'drizzle-orm/pg-core';
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
          payloadState: 'CANONICAL' as const,
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

const reviewCommand = {
  candidateId: 'candidate-id',
  expectedRevision: 0,
  actorUserId: 'actor-user-id',
  actorSub: 'actor-sub',
  requestId: 'request-id',
  occurredAt: new Date('2026-07-27T02:00:00.000Z'),
};

const pendingCandidate = {
  id: reviewCommand.candidateId,
  jobItemId: input.itemId,
  jobAttempt: input.attempt,
  typeVersionId: 'type-version-id',
  payloadState: 'CANONICAL',
  topicId: 'topic-id',
  difficulty: 3,
  payload: input.artifacts.candidates[0]!.candidate.payload,
  resultGroup: 'NORMAL',
  reviewStatus: 'PENDING',
  revision: 0,
  approvedQuestionId: null,
  approvedQuestionVersionId: null,
};

const withReviewRequestLock = <T extends object>(executor: T) => ({
  execute: vi.fn((query: unknown) => {
    void query;
    return Promise.resolve([]);
  }),
  ...executor,
});

const replayDatabase = (
  candidate: Record<string, unknown>,
  audit: Record<string, unknown>,
) => {
  const candidateLimit = vi.fn().mockResolvedValue([candidate]);
  const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
  const candidateWhere = vi.fn(() => ({ for: candidateFor }));
  const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
  const auditLimit = vi.fn().mockResolvedValue([audit]);
  const auditWhere = vi.fn(() => ({ limit: auditLimit }));
  const auditFrom = vi.fn(() => ({ where: auditWhere }));
  const select = vi
    .fn()
    .mockReturnValueOnce({ from: candidateFrom })
    .mockReturnValueOnce({ from: auditFrom });
  const transaction = vi.fn(
    (callback: (executor: unknown) => Promise<unknown>) =>
      callback(withReviewRequestLock({ select })),
  );
  return { transaction };
};

const reviewReplayCases = [
  {
    name: '승인',
    candidate: {
      ...pendingCandidate,
      reviewStatus: 'APPROVED',
      revision: 1,
      approvedQuestionId: 'question-id',
      approvedQuestionVersionId: 'version-id',
    },
    audit: {
      action: 'QUESTION_CANDIDATE_APPROVED',
      targetId: reviewCommand.candidateId,
      requestId: reviewCommand.requestId,
      actorUserId: reviewCommand.actorUserId,
      actorSub: reviewCommand.actorSub,
      summary: {
        expectedRevision: reviewCommand.expectedRevision,
        questionId: 'question-id',
        questionVersionId: 'version-id',
      },
    },
    invoke: (
      repository: DrizzleAiQuestionProductionRepository,
      command: typeof reviewCommand,
    ) => repository.approve(command),
    expected: {
      kind: 'ALREADY_APPROVED',
      questionId: 'question-id',
      questionVersionId: 'version-id',
    },
  },
  {
    name: '폐기',
    candidate: {
      ...pendingCandidate,
      reviewStatus: 'DISCARDED',
      revision: 1,
    },
    audit: {
      action: 'QUESTION_CANDIDATE_DISCARDED',
      targetId: reviewCommand.candidateId,
      requestId: reviewCommand.requestId,
      actorUserId: reviewCommand.actorUserId,
      actorSub: reviewCommand.actorSub,
      summary: { expectedRevision: reviewCommand.expectedRevision },
    },
    invoke: (
      repository: DrizzleAiQuestionProductionRepository,
      command: typeof reviewCommand,
    ) => repository.discard(command),
    expected: true,
  },
  {
    name: '재생성',
    candidate: pendingCandidate,
    audit: {
      action: 'QUESTION_CANDIDATE_REGENERATION_REQUESTED',
      targetId: reviewCommand.candidateId,
      requestId: reviewCommand.requestId,
      actorUserId: reviewCommand.actorUserId,
      actorSub: reviewCommand.actorSub,
      summary: {
        expectedRevision: reviewCommand.expectedRevision,
        jobId: input.jobId,
        attempt: input.attempt + 1,
        regeneratedFromCandidateId: reviewCommand.candidateId,
      },
    },
    invoke: (
      repository: DrizzleAiQuestionProductionRepository,
      command: typeof reviewCommand,
    ) => repository.requestRegeneration(command),
    expected: { jobId: input.jobId, attempt: input.attempt + 1 },
  },
] as const;

describe('AI 문제 제작 Drizzle 저장소', () => {
  it('재생성 dispatch writer가 없으면 transaction 시작 전에 실패한다', async () => {
    const transaction = vi.fn();
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction,
    } as never);

    await expect(repository.requestRegeneration(reviewCommand)).rejects.toThrow(
      'QUESTION_REGENERATION_DISPATCH_WRITER_NOT_CONFIGURED',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('request advisory lock을 parameter binding으로 candidate row lock보다 먼저 획득한다', async () => {
    const events: string[] = [];
    let advisoryQuery: unknown;
    const execute = vi.fn((query: unknown) => {
      events.push('request-lock');
      advisoryQuery = query;
      return Promise.resolve([]);
    });
    const candidateLimit = vi
      .fn()
      .mockResolvedValue([
        { ...pendingCandidate, reviewStatus: 'DISCARDED', revision: 1 },
      ]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const select = vi.fn(() => {
      events.push('select');
      return select.mock.calls.length === 1
        ? { from: candidateFrom }
        : { from: auditFrom };
    });
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction: vi.fn((callback: (executor: unknown) => Promise<unknown>) =>
        callback({ execute, select }),
      ),
    } as never);

    await expect(repository.approve(reviewCommand)).resolves.toEqual({
      kind: 'CONFLICT',
    });
    const compiled = new PgDialect().sqlToQuery(advisoryQuery as never);
    expect(compiled.sql).toContain(
      'pg_advisory_xact_lock(hashtextextended($1, 0))',
    );
    expect(compiled.params).toEqual([reviewCommand.requestId]);
    expect(events.slice(0, 2)).toEqual(['request-lock', 'select']);
  });

  it('NORMAL과 네 필수 검증 PASSED 후보만 row lock 뒤 DRAFT로 승인한다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([pendingCandidate]);
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
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom })
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
        callback(withReviewRequestLock({ insert, select, update })),
    );
    const createDraft = vi.fn().mockResolvedValue({
      questionId: 'question-id',
      questionVersionId: 'version-id',
    });
    const schedule = vi.fn().mockResolvedValue({ jobId: 'tts-job-id' });
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => reviewCommand.occurredAt,
      { createDraft },
      undefined,
      { schedule },
    );

    await expect(repository.approve(reviewCommand)).resolves.toEqual({
      kind: 'APPROVED',
      questionId: 'question-id',
      questionVersionId: 'version-id',
    });
    expect(candidateFor).toHaveBeenCalledWith('update');
    expect(createDraft).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledWith(expect.anything(), {
      draft: {
        questionId: 'question-id',
        questionVersionId: 'version-id',
      },
      requestedBy: reviewCommand.actorUserId,
      requestedAt: reviewCommand.occurredAt,
    });
    const draftInput: unknown = createDraft.mock.calls[0]?.[1];
    expect(draftInput).toMatchObject({
      candidate: {
        id: reviewCommand.candidateId,
        payload: pendingCandidate.payload,
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
          expectedRevision: reviewCommand.expectedRevision,
          previousRevision: 0,
          revision: 1,
          questionId: 'question-id',
          questionVersionId: 'version-id',
        },
      }),
    );
  });

  it('TTS schedule 실패는 후보 승인과 audit 전에 transaction을 실패시킨다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([pendingCandidate]);
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
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom })
      .mockReturnValueOnce({ from: validationFrom });
    const update = vi.fn();
    const insert = vi.fn();
    const createDraft = vi.fn().mockResolvedValue({
      questionId: 'question-id',
      questionVersionId: 'version-id',
    });
    const schedule = vi.fn().mockRejectedValue(new Error('OUTBOX_FAILED'));
    const repository = new DrizzleAiQuestionProductionRepository(
      {
        transaction: vi.fn(
          (callback: (executor: unknown) => Promise<unknown>) =>
            callback(withReviewRequestLock({ insert, select, update })),
        ),
      } as never,
      () => reviewCommand.occurredAt,
      { createDraft },
      undefined,
      { schedule },
    );

    await expect(repository.approve(reviewCommand)).rejects.toThrow(
      'OUTBOX_FAILED',
    );
    expect(createDraft).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('필수 검증 하나가 없거나 실패한 후보는 DRAFT를 만들지 않는다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([pendingCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const validationWhere = vi.fn().mockResolvedValue([
      { stage: 'SCHEMA', status: 'PASSED' },
      { stage: 'DECISION_RULE', status: 'PASSED' },
      { stage: 'SIMILARITY', status: 'FAILED' },
    ]);
    const validationFrom = vi.fn(() => ({ where: validationWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom })
      .mockReturnValueOnce({ from: validationFrom });
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) =>
        callback(withReviewRequestLock({ select })),
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

  it('REDACTED_INVALID 후보는 검증 row와 무관하게 DRAFT 승인을 거절한다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([
      {
        ...pendingCandidate,
        payloadState: 'REDACTED_INVALID',
        topicId: null,
        difficulty: null,
        payload: null,
        resultGroup: 'FAILED',
      },
    ]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
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
      .mockReturnValueOnce({ from: auditFrom })
      .mockReturnValueOnce({ from: validationFrom });
    const createDraft = vi.fn();
    const repository = new DrizzleAiQuestionProductionRepository(
      {
        transaction: vi.fn(
          (callback: (executor: unknown) => Promise<unknown>) =>
            callback(withReviewRequestLock({ select })),
        ),
      } as never,
      () => reviewCommand.occurredAt,
      { createDraft },
    );

    await expect(repository.approve(reviewCommand)).rejects.toThrow(
      'QUESTION_CANDIDATE_NOT_APPROVABLE',
    );
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('폐기 audit에 semantic replay 입력을 보존한다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([pendingCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom });
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: reviewCommand.candidateId }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction: vi.fn((callback: (executor: unknown) => Promise<unknown>) =>
        callback(withReviewRequestLock({ insert, select, update })),
      ),
    } as never);

    await expect(repository.discard(reviewCommand)).resolves.toBe(true);
    expect(values).toHaveBeenCalledWith({
      actorSub: reviewCommand.actorSub,
      actorUserId: reviewCommand.actorUserId,
      action: 'QUESTION_CANDIDATE_DISCARDED',
      target: reviewCommand.candidateId,
      targetType: 'QUESTION_CANDIDATE',
      targetId: reviewCommand.candidateId,
      summary: {
        expectedRevision: reviewCommand.expectedRevision,
        previousRevision: reviewCommand.expectedRevision,
        revision: reviewCommand.expectedRevision + 1,
      },
      requestId: reviewCommand.requestId,
      createdAt: reviewCommand.occurredAt,
    });
  });

  it.each(reviewReplayCases)(
    '$name command는 같은 semantic request만 replay한다',
    async ({ audit, candidate, expected, invoke, name }) => {
      const enqueue = vi.fn().mockResolvedValue(undefined);
      const repository = new DrizzleAiQuestionProductionRepository(
        replayDatabase(candidate, audit) as never,
        undefined,
        undefined,
        { enqueue },
      );

      await expect(
        invoke(repository, {
          ...reviewCommand,
          occurredAt: new Date('2026-07-27T02:05:00.000Z'),
        }),
      ).resolves.toEqual(expected);
      if (name === '재생성') expect(enqueue).not.toHaveBeenCalled();
    },
  );

  it.each(reviewReplayCases)(
    '$name command는 같은 request ID의 semantic payload 변경을 멱등 충돌로 거절한다',
    async ({ audit, candidate, invoke }) => {
      const changedCommands = [
        { ...reviewCommand, candidateId: 'changed-candidate-id' },
        { ...reviewCommand, actorUserId: 'changed-actor-user-id' },
        { ...reviewCommand, actorSub: 'changed-actor-sub' },
        { ...reviewCommand, expectedRevision: 1 },
      ];
      for (const command of changedCommands) {
        const enqueue = vi.fn().mockResolvedValue(undefined);
        const repository = new DrizzleAiQuestionProductionRepository(
          replayDatabase(candidate, audit) as never,
          undefined,
          undefined,
          { enqueue },
        );
        await expect(invoke(repository, command)).rejects.toThrow(
          'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT',
        );
        expect(enqueue).not.toHaveBeenCalled();
      }
    },
  );

  it('같은 request ID를 다른 후보 command action에 재사용하면 멱등 충돌로 거절한다', async () => {
    const discarded = {
      ...pendingCandidate,
      reviewStatus: 'DISCARDED',
      revision: 1,
    };
    const approvalAudit = {
      action: 'QUESTION_CANDIDATE_APPROVED',
      targetId: reviewCommand.candidateId,
      requestId: reviewCommand.requestId,
      actorUserId: reviewCommand.actorUserId,
      actorSub: reviewCommand.actorSub,
      summary: { expectedRevision: reviewCommand.expectedRevision },
    };
    const repository = new DrizzleAiQuestionProductionRepository(
      replayDatabase(discarded, approvalAudit) as never,
    );

    await expect(repository.discard(reviewCommand)).rejects.toThrow(
      'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT',
    );
  });

  it('다른 후보가 먼저 쓴 request ID로 PENDING 후보를 승인하지 않는다', async () => {
    const priorAudit = {
      action: 'QUESTION_CANDIDATE_DISCARDED',
      targetId: 'other-candidate-id',
      requestId: reviewCommand.requestId,
      actorUserId: reviewCommand.actorUserId,
      actorSub: reviewCommand.actorSub,
      summary: { expectedRevision: reviewCommand.expectedRevision },
    };
    const repository = new DrizzleAiQuestionProductionRepository(
      replayDatabase(pendingCandidate, priorAudit) as never,
    );

    await expect(repository.approve(reviewCommand)).rejects.toThrow(
      'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT',
    );
  });

  it('폐기된 후보와 승인된 후보의 다른 terminal 전이를 거절한다', async () => {
    const rows = [
      { ...pendingCandidate, reviewStatus: 'DISCARDED', revision: 1 },
      {
        ...pendingCandidate,
        reviewStatus: 'APPROVED',
        revision: 1,
        approvedQuestionId: 'question-id',
        approvedQuestionVersionId: 'version-id',
      },
    ];
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) => {
        const candidateLimit = vi.fn().mockResolvedValue([rows.shift()]);
        const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
        const candidateWhere = vi.fn(() => ({ for: candidateFor }));
        const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
        const auditLimit = vi.fn().mockResolvedValue([]);
        const auditWhere = vi.fn(() => ({ limit: auditLimit }));
        const auditFrom = vi.fn(() => ({ where: auditWhere }));
        const select = vi
          .fn()
          .mockReturnValueOnce({ from: candidateFrom })
          .mockReturnValueOnce({ from: auditFrom });
        return callback(withReviewRequestLock({ select }));
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
    const candidateLimit = vi.fn().mockResolvedValue([pendingCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const itemLimit = vi.fn().mockResolvedValue([
      {
        id: input.itemId,
        jobId: input.jobId,
        attempt: input.attempt,
        status: 'SUCCEEDED',
        leaseToken: null,
        leaseUntil: null,
      },
    ]);
    const itemFor = vi.fn(() => ({ limit: itemLimit }));
    const itemWhere = vi.fn(() => ({ for: itemFor }));
    const itemFrom = vi.fn(() => ({ where: itemWhere }));
    const jobLimit = vi.fn().mockResolvedValue([
      {
        id: input.jobId,
        attempt: input.attempt,
        status: 'COMPLETED',
      },
    ]);
    const jobFor = vi.fn(() => ({ limit: jobLimit }));
    const jobWhere = vi.fn(() => ({ for: jobFor }));
    const jobFrom = vi.fn(() => ({ where: jobWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom })
      .mockReturnValueOnce({ from: itemFrom })
      .mockReturnValueOnce({ from: jobFrom });
    const returning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const auditValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values: auditValues }));
    const executor = withReviewRequestLock({ insert, select, update });
    const transaction = vi.fn(
      (callback: (executor: unknown) => Promise<unknown>) => callback(executor),
    );
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => reviewCommand.occurredAt,
      { createDraft: vi.fn() },
      { enqueue },
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
          expectedRevision: reviewCommand.expectedRevision,
          jobId: input.jobId,
          attempt: input.attempt + 1,
          regeneratedFromCandidateId: reviewCommand.candidateId,
        },
      }),
    );
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(executor, {
      destination: 'CONTENT_PRODUCTION',
      jobId: input.jobId,
      attempt: input.attempt + 1,
      requestedAt: reviewCommand.occurredAt,
    });
  });

  it('재생성 dispatch 기록 실패는 성공 결과와 감사를 확정하지 않는다', async () => {
    const lockedRow = (row: Record<string, unknown>) => {
      const limit = vi.fn().mockResolvedValue([row]);
      const forUpdate = vi.fn(() => ({ limit }));
      const where = vi.fn(() => ({ for: forUpdate }));
      return vi.fn(() => ({ where }));
    };
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: lockedRow(pendingCandidate) })
      .mockReturnValueOnce({ from: auditFrom })
      .mockReturnValueOnce({
        from: lockedRow({
          id: input.itemId,
          jobId: input.jobId,
          attempt: input.attempt,
          status: 'SUCCEEDED',
          leaseToken: null,
          leaseUntil: null,
        }),
      })
      .mockReturnValueOnce({
        from: lockedRow({
          id: input.jobId,
          attempt: input.attempt,
          status: 'COMPLETED',
        }),
      });
    const returning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning })),
      })),
    }));
    const auditValues = vi.fn().mockResolvedValue(undefined);
    const executor = withReviewRequestLock({
      insert: vi.fn(() => ({ values: auditValues })),
      select,
      update,
    });
    const transaction = vi.fn(
      async (callback: (executor: unknown) => Promise<unknown>) =>
        callback(executor),
    );
    const enqueue = vi
      .fn()
      .mockRejectedValue(new Error('OUTBOX_INSERT_FAILED'));
    const repository = new DrizzleAiQuestionProductionRepository(
      { transaction } as never,
      () => reviewCommand.occurredAt,
      undefined,
      { enqueue },
    );

    await expect(repository.requestRegeneration(reviewCommand)).rejects.toThrow(
      'OUTBOX_INSERT_FAILED',
    );
    expect(enqueue).toHaveBeenCalledOnce();
    expect(auditValues).not.toHaveBeenCalled();
  });

  it('PROCESSING item과 활성 lease는 재생성으로 덮어쓰지 않는다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([pendingCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const itemLimit = vi.fn().mockResolvedValue([
      {
        id: input.itemId,
        jobId: input.jobId,
        attempt: input.attempt,
        status: 'PROCESSING',
        leaseToken: 'active-lease',
        leaseUntil: new Date('2026-07-27T03:00:00.000Z'),
      },
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
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const repository = new DrizzleAiQuestionProductionRepository(
      {
        transaction: vi.fn(
          (callback: (executor: unknown) => Promise<unknown>) =>
            callback(withReviewRequestLock({ insert, select, update })),
        ),
      } as never,
      undefined,
      undefined,
      { enqueue },
    );

    await expect(repository.requestRegeneration(reviewCommand)).rejects.toThrow(
      'QUESTION_CANDIDATE_REVIEW_CONFLICT',
    );
    expect(update).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('item lifecycle CAS가 0건이면 job을 재개하지 않는다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([pendingCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const itemLimit = vi.fn().mockResolvedValue([
      {
        id: input.itemId,
        jobId: input.jobId,
        attempt: input.attempt,
        status: 'NEEDS_ATTENTION',
        leaseToken: null,
        leaseUntil: null,
      },
    ]);
    const itemFor = vi.fn(() => ({ limit: itemLimit }));
    const itemWhere = vi.fn(() => ({ for: itemFor }));
    const itemFrom = vi.fn(() => ({ where: itemWhere }));
    const jobLimit = vi.fn().mockResolvedValue([
      {
        id: input.jobId,
        attempt: input.attempt,
        status: 'COMPLETED_WITH_FAILURES',
      },
    ]);
    const jobFor = vi.fn(() => ({ limit: jobLimit }));
    const jobWhere = vi.fn(() => ({ for: jobFor }));
    const jobFrom = vi.fn(() => ({ where: jobWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom })
      .mockReturnValueOnce({ from: itemFrom })
      .mockReturnValueOnce({ from: jobFrom });
    const itemReturning = vi.fn().mockResolvedValue([]);
    const itemWhereUpdate = vi.fn(() => ({ returning: itemReturning }));
    const update = vi.fn().mockReturnValueOnce({
      set: vi.fn(() => ({ where: itemWhereUpdate })),
    });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const repository = new DrizzleAiQuestionProductionRepository(
      {
        transaction: vi.fn(
          (callback: (executor: unknown) => Promise<unknown>) =>
            callback(withReviewRequestLock({ select, update })),
        ),
      } as never,
      undefined,
      undefined,
      { enqueue },
    );

    await expect(repository.requestRegeneration(reviewCommand)).rejects.toThrow(
      'QUESTION_CANDIDATE_REVIEW_CONFLICT',
    );
    expect(itemReturning).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('job lifecycle CAS가 0건이면 item 재개를 transaction conflict로 되돌린다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([pendingCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const itemLimit = vi.fn().mockResolvedValue([
      {
        id: input.itemId,
        jobId: input.jobId,
        attempt: input.attempt,
        status: 'FAILED',
        leaseToken: null,
        leaseUntil: null,
      },
    ]);
    const itemFor = vi.fn(() => ({ limit: itemLimit }));
    const itemWhere = vi.fn(() => ({ for: itemFor }));
    const itemFrom = vi.fn(() => ({ where: itemWhere }));
    const jobLimit = vi
      .fn()
      .mockResolvedValue([
        { id: input.jobId, attempt: input.attempt, status: 'FAILED' },
      ]);
    const jobFor = vi.fn(() => ({ limit: jobLimit }));
    const jobWhere = vi.fn(() => ({ for: jobFor }));
    const jobFrom = vi.fn(() => ({ where: jobWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom })
      .mockReturnValueOnce({ from: itemFrom })
      .mockReturnValueOnce({ from: jobFrom });
    const itemReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const itemWhereUpdate = vi.fn(() => ({ returning: itemReturning }));
    const jobReturning = vi.fn().mockResolvedValue([]);
    const jobWhereUpdate = vi.fn(() => ({ returning: jobReturning }));
    const candidateReturning = vi
      .fn()
      .mockResolvedValue([{ id: reviewCommand.candidateId }]);
    const candidateWhereUpdate = vi.fn(() => ({
      returning: candidateReturning,
    }));
    const update = vi
      .fn()
      .mockReturnValueOnce({ set: vi.fn(() => ({ where: itemWhereUpdate })) })
      .mockReturnValueOnce({ set: vi.fn(() => ({ where: jobWhereUpdate })) })
      .mockReturnValueOnce({
        set: vi.fn(() => ({ where: candidateWhereUpdate })),
      });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const repository = new DrizzleAiQuestionProductionRepository(
      {
        transaction: vi.fn(
          (callback: (executor: unknown) => Promise<unknown>) =>
            callback(withReviewRequestLock({ select, update })),
        ),
      } as never,
      undefined,
      undefined,
      { enqueue },
    );

    await expect(repository.requestRegeneration(reviewCommand)).rejects.toThrow(
      'QUESTION_CANDIDATE_REVIEW_CONFLICT',
    );
    expect(jobReturning).toHaveBeenCalledOnce();
    expect(candidateReturning).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('candidate revision CAS가 0건이면 두 번째 재생성을 conflict로 되돌린다', async () => {
    const candidateLimit = vi.fn().mockResolvedValue([pendingCandidate]);
    const candidateFor = vi.fn(() => ({ limit: candidateLimit }));
    const candidateWhere = vi.fn(() => ({ for: candidateFor }));
    const candidateFrom = vi.fn(() => ({ where: candidateWhere }));
    const auditLimit = vi.fn().mockResolvedValue([]);
    const auditWhere = vi.fn(() => ({ limit: auditLimit }));
    const auditFrom = vi.fn(() => ({ where: auditWhere }));
    const itemLimit = vi.fn().mockResolvedValue([
      {
        id: input.itemId,
        jobId: input.jobId,
        attempt: input.attempt,
        status: 'SUCCEEDED',
        leaseToken: null,
        leaseUntil: null,
      },
    ]);
    const itemFor = vi.fn(() => ({ limit: itemLimit }));
    const itemWhere = vi.fn(() => ({ for: itemFor }));
    const itemFrom = vi.fn(() => ({ where: itemWhere }));
    const jobLimit = vi
      .fn()
      .mockResolvedValue([
        { id: input.jobId, attempt: input.attempt, status: 'COMPLETED' },
      ]);
    const jobFor = vi.fn(() => ({ limit: jobLimit }));
    const jobWhere = vi.fn(() => ({ for: jobFor }));
    const jobFrom = vi.fn(() => ({ where: jobWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: candidateFrom })
      .mockReturnValueOnce({ from: auditFrom })
      .mockReturnValueOnce({ from: itemFrom })
      .mockReturnValueOnce({ from: jobFrom });
    const successReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const candidateReturning = vi.fn().mockResolvedValue([]);
    const update = vi
      .fn()
      .mockReturnValueOnce({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: successReturning })),
        })),
      })
      .mockReturnValueOnce({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: successReturning })),
        })),
      })
      .mockReturnValueOnce({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: candidateReturning })),
        })),
      });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const repository = new DrizzleAiQuestionProductionRepository(
      {
        transaction: vi.fn(
          (callback: (executor: unknown) => Promise<unknown>) =>
            callback(withReviewRequestLock({ select, update })),
        ),
      } as never,
      undefined,
      undefined,
      { enqueue },
    );

    await expect(repository.requestRegeneration(reviewCommand)).rejects.toThrow(
      'QUESTION_CANDIDATE_REVIEW_CONFLICT',
    );
    expect(candidateReturning).toHaveBeenCalledOnce();
    expect(enqueue).not.toHaveBeenCalled();
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

  it('redacted 후보는 신뢰한 type만 유지하고 FK·payload를 null로 저장한다', async () => {
    const values = vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: 'candidate-id', ordinal: 0 }]),
      })),
    }));
    const validationValues = vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'validation-id' }]),
      })),
    }));
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values })
      .mockReturnValueOnce({ values: validationValues });
    const terminalReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const terminalWhere = vi.fn(() => ({ returning: terminalReturning }));
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: terminalWhere })),
    }));
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction: vi.fn((callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, update }),
      ),
    } as never);
    const redactedInput = {
      ...input,
      artifacts: {
        ...input.artifacts,
        candidates: [
          {
            ...input.artifacts.candidates[0]!,
            candidate: {
              payloadState: 'REDACTED_INVALID' as const,
              questionTypeVersionId: 'type-version-id',
              topicId: null,
              tagIds: [] as [],
              difficulty: null,
              payload: null,
            },
            payloadHash:
              '79732325ba08de315b7ed66b263eacf3222cb949fc1d2063d536cf7312775eb8',
            resultGroup: 'FAILED' as const,
            reviewCode: 'QUESTION_SCHEMA_INVALID',
          },
        ],
      },
    };

    await expect(repository.persist(redactedInput)).resolves.toBe(true);
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({
        payloadState: 'REDACTED_INVALID',
        typeVersionId: 'type-version-id',
        topicId: null,
        difficulty: null,
        payload: null,
      }),
    ]);
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
          payloadState: 'CANONICAL',
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

  it('같은 redacted snapshot replay는 null 조합과 payload state까지 비교한다', async () => {
    const redactedInput = {
      ...input,
      artifacts: {
        ...input.artifacts,
        candidates: [
          {
            ...input.artifacts.candidates[0]!,
            candidate: {
              payloadState: 'REDACTED_INVALID' as const,
              questionTypeVersionId: 'type-version-id',
              topicId: null,
              tagIds: [] as [],
              difficulty: null,
              payload: null,
            },
            payloadHash:
              '79732325ba08de315b7ed66b263eacf3222cb949fc1d2063d536cf7312775eb8',
            resultGroup: 'FAILED' as const,
            reviewCode: 'QUESTION_SCHEMA_INVALID',
          },
        ],
      },
    };
    const candidateReturning = vi.fn().mockResolvedValue([]);
    const validationReturning = vi
      .fn()
      .mockResolvedValue([{ id: 'validation-id' }]);
    const insert = vi
      .fn()
      .mockReturnValueOnce({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: candidateReturning,
          })),
        })),
      })
      .mockReturnValueOnce({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: validationReturning,
          })),
        })),
      });
    const limit = vi.fn().mockResolvedValue([
      {
        id: 'candidate-id',
        ordinal: 0,
        typeVersionId: 'type-version-id',
        payloadState: 'REDACTED_INVALID',
        topicId: null,
        difficulty: null,
        payload: null,
        payloadHash:
          '79732325ba08de315b7ed66b263eacf3222cb949fc1d2063d536cf7312775eb8',
        resultGroup: 'FAILED',
        reviewStatus: 'PENDING',
        reviewCode: 'QUESTION_SCHEMA_INVALID',
        regeneratedFromCandidateId: null,
        approvedQuestionId: null,
        approvedQuestionVersionId: null,
      },
    ]);
    const select = vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })),
    }));
    const terminalReturning = vi.fn().mockResolvedValue([{ id: input.itemId }]);
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: terminalReturning })),
      })),
    }));
    const repository = new DrizzleAiQuestionProductionRepository({
      transaction: vi.fn((callback: (executor: unknown) => Promise<unknown>) =>
        callback({ insert, select, update }),
      ),
    } as never);

    await expect(repository.persist(redactedInput)).resolves.toBe(true);
    expect(limit).toHaveBeenCalledOnce();
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
        payloadState: 'CANONICAL',
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
        payloadState: 'CANONICAL',
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
