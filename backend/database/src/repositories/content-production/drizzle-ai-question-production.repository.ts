/** AI 문제 후보 artifact와 item terminal 전이를 같은 PostgreSQL transaction으로 저장한다 */
import { isDeepStrictEqual } from 'node:util';
import { QuestionCandidateReviewError } from '@flex-thia/domain';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type {
  ApprovedQuestionDraft,
  ApproveQuestionCandidateInput,
  DiscardQuestionCandidateInput,
  GeneratedQuestionDraftRepository,
  GeneratedQuestionPayload,
  QuestionProductionCandidateRepository,
  QuestionProductionProviderExecution,
  QuestionProductionProviderFailure,
  QuestionProductionProviderResult,
  QuestionProductionProviderRunRepository,
  QuestionProductionValidationRecord,
  QuestionRegenerationDispatchWriter,
  RegenerateQuestionCandidateInput,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  questionProductionCandidates,
  questionProductionValidations,
} from '../../schema/ai-question-production.schema.js';
import { auditLogs } from '../../schema/identity.schema.js';
import { jobItems, jobs, providerRuns } from '../../schema/jobs.schema.js';
import * as schema from '../../schema/index.js';

type QuestionProductionDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
/** 생성 DRAFT adapter가 후보 갱신과 같은 commit 경계를 공유할 Drizzle session */
export type QuestionProductionTransaction = Parameters<
  Parameters<QuestionProductionDatabase['transaction']>[0]
>[0];

/** nullable-audio 문제 graph 생성을 후보 승인 transaction 안에 주입하는 port */
export interface GeneratedQuestionDraftWriter {
  createDraft(
    transaction: QuestionProductionTransaction,
    input: {
      candidate: {
        id: string;
        typeVersionId: string;
        topicId: string;
        difficulty: number;
        payload: GeneratedQuestionPayload;
      };
      actor: {
        actorUserId: string;
        actorSub: string;
        requestId: string;
        occurredAt: Date;
      };
    },
  ): Promise<ApprovedQuestionDraft>;
}

/** 생성 DRAFT와 같은 transaction에 초기 TTS job·dispatch를 예약하는 port */
export interface GeneratedQuestionTtsScheduler {
  schedule(
    transaction: QuestionProductionTransaction,
    input: {
      draft: ApprovedQuestionDraft;
      requestedBy: string;
      requestedAt: Date;
    },
  ): Promise<{ jobId: string }>;
}

type ReviewCandidate = {
  id: string;
  jobItemId: string;
  jobAttempt: number;
  typeVersionId: string;
  payloadState: 'CANONICAL' | 'REDACTED_INVALID';
  topicId: string | null;
  difficulty: number | null;
  payload: Record<string, unknown> | null;
  resultGroup: 'NORMAL' | 'NEEDS_ATTENTION' | 'FAILED';
  reviewStatus: 'PENDING' | 'APPROVED' | 'DISCARDED';
  revision: number;
  approvedQuestionId: string | null;
  approvedQuestionVersionId: string | null;
};

type ReviewReplay = {
  action: string;
  targetId: string | null;
  requestId: string;
  actorUserId: string | null;
  actorSub: string;
  summary: Record<string, unknown>;
};

const requiredValidationStages = new Set([
  'SCHEMA',
  'DECISION_RULE',
  'SIMILARITY',
  'AI_CROSS_VALIDATION',
]);

const lockReviewRequest = (
  transaction: QuestionProductionTransaction,
  requestId: string,
): Promise<unknown> =>
  transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`,
  );

const readReviewCandidate = async (
  transaction: QuestionProductionTransaction,
  candidateId: string,
): Promise<ReviewCandidate | null> => {
  const [candidate] = await transaction
    .select({
      id: questionProductionCandidates.id,
      jobItemId: questionProductionCandidates.jobItemId,
      jobAttempt: questionProductionCandidates.jobAttempt,
      typeVersionId: questionProductionCandidates.typeVersionId,
      payloadState: questionProductionCandidates.payloadState,
      topicId: questionProductionCandidates.topicId,
      difficulty: questionProductionCandidates.difficulty,
      payload: questionProductionCandidates.payload,
      resultGroup: questionProductionCandidates.resultGroup,
      reviewStatus: questionProductionCandidates.reviewStatus,
      revision: questionProductionCandidates.revision,
      approvedQuestionId: questionProductionCandidates.approvedQuestionId,
      approvedQuestionVersionId:
        questionProductionCandidates.approvedQuestionVersionId,
    })
    .from(questionProductionCandidates)
    .where(eq(questionProductionCandidates.id, candidateId))
    .for('update')
    .limit(1);
  return (candidate as ReviewCandidate | undefined) ?? null;
};

const readReviewReplay = async (
  transaction: QuestionProductionTransaction,
  input: {
    candidateId: string;
    requestId: string;
    action: string;
  },
): Promise<ReviewReplay | null> => {
  const [audit] = await transaction
    .select({
      action: auditLogs.action,
      targetId: auditLogs.targetId,
      requestId: auditLogs.requestId,
      actorUserId: auditLogs.actorUserId,
      actorSub: auditLogs.actorSub,
      summary: auditLogs.summary,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.targetType, 'QUESTION_CANDIDATE'),
        eq(auditLogs.requestId, input.requestId),
      ),
    )
    .limit(1);
  return audit ?? null;
};

const isExactReviewReplay = (
  replay: ReviewReplay,
  input: ApproveQuestionCandidateInput,
  action: string,
): boolean =>
  replay.action === action &&
  replay.targetId === input.candidateId &&
  replay.requestId === input.requestId &&
  replay.actorUserId === input.actorUserId &&
  replay.actorSub === input.actorSub &&
  replay.summary['expectedRevision'] === input.expectedRevision;

const throwIdempotencyConflict = (): never => {
  throw new QuestionCandidateReviewError(
    'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT',
  );
};

const throwReviewConflict = (): never => {
  throw new QuestionCandidateReviewError('QUESTION_CANDIDATE_REVIEW_CONFLICT');
};

const appendReviewAudit = (
  transaction: QuestionProductionTransaction,
  input: {
    command: ApproveQuestionCandidateInput;
    action: string;
    summary: Record<string, unknown>;
  },
): Promise<unknown> =>
  transaction.insert(auditLogs).values({
    actorSub: input.command.actorSub,
    actorUserId: input.command.actorUserId,
    action: input.action,
    target: input.command.candidateId,
    targetType: 'QUESTION_CANDIDATE',
    targetId: input.command.candidateId,
    summary: input.summary,
    requestId: input.command.requestId,
    createdAt: input.command.occurredAt,
  });

const isApprovedReplay = (
  candidate: ReviewCandidate,
  replay: ReviewReplay,
): candidate is ReviewCandidate & {
  approvedQuestionId: string;
  approvedQuestionVersionId: string;
} =>
  candidate.reviewStatus === 'APPROVED' &&
  candidate.approvedQuestionId !== null &&
  candidate.approvedQuestionVersionId !== null &&
  replay.summary['questionId'] === candidate.approvedQuestionId &&
  replay.summary['questionVersionId'] === candidate.approvedQuestionVersionId;

const hasAllPassedValidations = (
  validations: Array<{ stage: string; status: string }>,
): boolean => {
  const passedStages = new Set(
    validations
      .filter(({ status }) => status === 'PASSED')
      .map(({ stage }) => stage),
  );
  return (
    validations.every(({ status }) => status === 'PASSED') &&
    [...requiredValidationStages].every((stage) => passedStages.has(stage))
  );
};

const canonicalJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJsonValue(item)]),
  );
};

const candidateWhere = (input: {
  itemId: string;
  attempt: number;
  ordinal: number;
}) =>
  and(
    eq(questionProductionCandidates.jobItemId, input.itemId),
    eq(questionProductionCandidates.jobAttempt, input.attempt),
    eq(questionProductionCandidates.ordinal, input.ordinal),
  );

const candidateValues = (
  input: Parameters<QuestionProductionCandidateRepository['persist']>[0],
  regeneratedFromCandidateId: string | null,
) =>
  input.artifacts.candidates.map((record) => ({
    jobItemId: input.itemId,
    jobAttempt: input.attempt,
    ordinal: record.ordinal,
    typeVersionId: record.candidate.questionTypeVersionId,
    payloadState: record.candidate.payloadState,
    topicId: record.candidate.topicId,
    difficulty: record.candidate.difficulty,
    payload: record.candidate.payload as unknown as Record<string, unknown>,
    payloadHash: record.payloadHash,
    resultGroup: record.resultGroup,
    reviewStatus: record.reviewStatus,
    reviewCode: record.reviewCode,
    regeneratedFromCandidateId:
      record.regeneratedFromCandidateId ?? regeneratedFromCandidateId,
    approvedQuestionId: record.approvedQuestionId,
    approvedQuestionVersionId: record.approvedQuestionVersionId,
  }));

const existingCandidateIds = async (
  transaction: QuestionProductionTransaction,
  input: Parameters<QuestionProductionCandidateRepository['persist']>[0],
): Promise<Map<number, string>> => {
  const ids = new Map<number, string>();
  for (const record of input.artifacts.candidates) {
    const [existing] = await transaction
      .select({
        id: questionProductionCandidates.id,
        ordinal: questionProductionCandidates.ordinal,
        typeVersionId: questionProductionCandidates.typeVersionId,
        payloadState: questionProductionCandidates.payloadState,
        topicId: questionProductionCandidates.topicId,
        difficulty: questionProductionCandidates.difficulty,
        payload: questionProductionCandidates.payload,
        payloadHash: questionProductionCandidates.payloadHash,
        resultGroup: questionProductionCandidates.resultGroup,
        reviewStatus: questionProductionCandidates.reviewStatus,
        reviewCode: questionProductionCandidates.reviewCode,
        regeneratedFromCandidateId:
          questionProductionCandidates.regeneratedFromCandidateId,
        approvedQuestionId: questionProductionCandidates.approvedQuestionId,
        approvedQuestionVersionId:
          questionProductionCandidates.approvedQuestionVersionId,
      })
      .from(questionProductionCandidates)
      .where(
        candidateWhere({
          itemId: input.itemId,
          attempt: input.attempt,
          ordinal: record.ordinal,
        }),
      )
      .limit(1);
    if (!existing) {
      throw new Error(
        `저장된 AI 문제 후보를 찾을 수 없습니다: ${record.ordinal}`,
      );
    }
    const expected = {
      typeVersionId: record.candidate.questionTypeVersionId,
      payloadState: record.candidate.payloadState,
      topicId: record.candidate.topicId,
      difficulty: record.candidate.difficulty,
      payload: record.candidate.payload as unknown as Record<string, unknown>,
      payloadHash: record.payloadHash,
      resultGroup: record.resultGroup,
      reviewStatus: record.reviewStatus,
      reviewCode: record.reviewCode,
      regeneratedFromCandidateId: record.regeneratedFromCandidateId,
      approvedQuestionId: record.approvedQuestionId,
      approvedQuestionVersionId: record.approvedQuestionVersionId,
    };
    const { id, ordinal, payload, ...actual } = existing;
    const { payload: expectedPayload, ...expectedFields } = expected;
    if (
      !isDeepStrictEqual(actual, expectedFields) ||
      !isDeepStrictEqual(
        canonicalJsonValue(payload),
        canonicalJsonValue(expectedPayload),
      )
    ) {
      throw new Error('QUESTION_CANDIDATE_REPLAY_CONFLICT');
    }
    ids.set(ordinal, id);
  }
  return ids;
};

const validationValues = (
  validations: QuestionProductionValidationRecord[],
  candidateIds: Map<number, string>,
) =>
  validations.map((validation) => {
    const candidateId = candidateIds.get(validation.candidateOrdinal);
    if (!candidateId) {
      throw new Error(
        `검증 대상 AI 문제 후보를 찾을 수 없습니다: ${validation.candidateOrdinal}`,
      );
    }
    return {
      candidateId,
      stage: validation.stage,
      status: validation.status,
      code: validation.code,
      details: validation.details,
    };
  });

const persistValidations = async (
  transaction: QuestionProductionTransaction,
  validations: QuestionProductionValidationRecord[],
  candidateIds: Map<number, string>,
): Promise<void> => {
  for (const value of validationValues(validations, candidateIds)) {
    const inserted = await transaction
      .insert(questionProductionValidations)
      .values(value)
      .onConflictDoNothing()
      .returning({ id: questionProductionValidations.id });
    if (inserted.length > 0) continue;

    const [existing] = await transaction
      .select({
        id: questionProductionValidations.id,
        status: questionProductionValidations.status,
        code: questionProductionValidations.code,
        details: questionProductionValidations.details,
      })
      .from(questionProductionValidations)
      .where(
        and(
          eq(questionProductionValidations.candidateId, value.candidateId),
          eq(questionProductionValidations.stage, value.stage),
        ),
      )
      .limit(1);
    if (
      !existing ||
      !isDeepStrictEqual(
        {
          status: existing.status,
          code: existing.code,
          details: existing.details,
        },
        { status: value.status, code: value.code, details: value.details },
      )
    ) {
      throw new Error('QUESTION_VALIDATION_REPLAY_CONFLICT');
    }
  }
};

const providerExecutionWhere = (
  execution: QuestionProductionProviderExecution,
) =>
  and(
    eq(providerRuns.jobItemId, execution.jobItemId),
    eq(providerRuns.attempt, execution.jobAttempt),
    eq(providerRuns.operation, execution.operation),
    eq(providerRuns.sequence, execution.sequence),
  );

const readProviderExecution = async (
  transaction: QuestionProductionTransaction,
  execution: QuestionProductionProviderExecution,
) => {
  const [run] = await transaction
    .select({
      id: providerRuns.id,
      status: providerRuns.status,
      result: providerRuns.result,
      itemLeaseToken: providerRuns.itemLeaseToken,
    })
    .from(providerRuns)
    .where(providerExecutionWhere(execution))
    .limit(1);
  return run;
};

const replayProviderResult = (
  run: Awaited<ReturnType<typeof readProviderExecution>>,
):
  | { kind: 'REPLAY'; result: QuestionProductionProviderResult }
  | { kind: 'OUTCOME_UNKNOWN' }
  | null => {
  if (!run) return null;
  if (run.status === 'SUCCEEDED' && run.result) {
    return {
      kind: 'REPLAY',
      result: run.result as QuestionProductionProviderResult,
    };
  }
  return { kind: 'OUTCOME_UNKNOWN' };
};

/** lease 조건을 충족할 때만 문제 후보·검증 결과와 terminal item을 함께 확정한다 */
export class DrizzleAiQuestionProductionRepository
  implements
    QuestionProductionCandidateRepository,
    QuestionProductionProviderRunRepository,
    GeneratedQuestionDraftRepository
{
  constructor(
    private readonly database: QuestionProductionDatabase,
    private readonly now: () => Date = () => new Date(),
    private readonly draftWriter?: GeneratedQuestionDraftWriter,
    private readonly regenerationDispatchWriter?: QuestionRegenerationDispatchWriter<QuestionProductionTransaction>,
    private readonly ttsScheduler?: GeneratedQuestionTtsScheduler,
  ) {}

  /** 검증 완료 후보를 잠근 채 nullable-audio DRAFT·연결·감사를 한 commit으로 만든다 */
  async approve(
    input: ApproveQuestionCandidateInput,
  ): ReturnType<GeneratedQuestionDraftRepository['approve']> {
    return this.database.transaction(async (transaction) => {
      await lockReviewRequest(transaction, input.requestId);
      const candidate = await readReviewCandidate(
        transaction,
        input.candidateId,
      );
      if (!candidate) return { kind: 'CONFLICT' };

      const replay = await readReviewReplay(transaction, {
        candidateId: input.candidateId,
        requestId: input.requestId,
        action: 'QUESTION_CANDIDATE_APPROVED',
      });
      if (
        replay &&
        !isExactReviewReplay(replay, input, 'QUESTION_CANDIDATE_APPROVED')
      ) {
        throwIdempotencyConflict();
      }
      if (candidate.reviewStatus === 'APPROVED') {
        return replay && isApprovedReplay(candidate, replay)
          ? {
              kind: 'ALREADY_APPROVED',
              questionId: candidate.approvedQuestionId,
              questionVersionId: candidate.approvedQuestionVersionId,
            }
          : { kind: 'CONFLICT' };
      }
      if (replay) return { kind: 'CONFLICT' };
      if (
        candidate.reviewStatus !== 'PENDING' ||
        candidate.revision !== input.expectedRevision
      ) {
        return { kind: 'CONFLICT' };
      }

      const validations = await transaction
        .select({
          stage: questionProductionValidations.stage,
          status: questionProductionValidations.status,
        })
        .from(questionProductionValidations)
        .where(
          eq(questionProductionValidations.candidateId, input.candidateId),
        );
      if (
        candidate.payloadState !== 'CANONICAL' ||
        candidate.topicId === null ||
        candidate.difficulty === null ||
        candidate.payload === null ||
        candidate.resultGroup !== 'NORMAL' ||
        !hasAllPassedValidations(validations)
      ) {
        throw new QuestionCandidateReviewError(
          'QUESTION_CANDIDATE_NOT_APPROVABLE',
        );
      }
      if (!this.draftWriter) {
        throw new Error('QUESTION_DRAFT_WRITER_NOT_CONFIGURED');
      }
      if (!this.ttsScheduler) {
        throw new Error('QUESTION_TTS_SCHEDULER_NOT_CONFIGURED');
      }

      const draft = await this.draftWriter.createDraft(transaction, {
        candidate: {
          id: candidate.id,
          typeVersionId: candidate.typeVersionId,
          topicId: candidate.topicId,
          difficulty: candidate.difficulty,
          payload: candidate.payload as unknown as GeneratedQuestionPayload,
        },
        actor: {
          actorUserId: input.actorUserId,
          actorSub: input.actorSub,
          requestId: input.requestId,
          occurredAt: input.occurredAt,
        },
      });
      await this.ttsScheduler.schedule(transaction, {
        draft,
        requestedBy: input.actorUserId,
        requestedAt: input.occurredAt,
      });
      const nextRevision = candidate.revision + 1;
      const updated = await transaction
        .update(questionProductionCandidates)
        .set({
          reviewStatus: 'APPROVED',
          approvedQuestionId: draft.questionId,
          approvedQuestionVersionId: draft.questionVersionId,
          revision: nextRevision,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(questionProductionCandidates.id, input.candidateId),
            eq(questionProductionCandidates.reviewStatus, 'PENDING'),
            eq(questionProductionCandidates.revision, input.expectedRevision),
          ),
        )
        .returning({ id: questionProductionCandidates.id });
      if (updated.length !== 1) {
        throw new QuestionCandidateReviewError(
          'QUESTION_CANDIDATE_REVIEW_CONFLICT',
        );
      }

      await appendReviewAudit(transaction, {
        command: input,
        action: 'QUESTION_CANDIDATE_APPROVED',
        summary: {
          expectedRevision: input.expectedRevision,
          previousRevision: candidate.revision,
          revision: nextRevision,
          questionId: draft.questionId,
          questionVersionId: draft.questionVersionId,
        },
      });
      return {
        kind: 'APPROVED',
        questionId: draft.questionId,
        questionVersionId: draft.questionVersionId,
      };
    });
  }

  /** PENDING 후보만 terminal 폐기하고 같은 request replay만 성공으로 인정한다 */
  async discard(input: DiscardQuestionCandidateInput): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      await lockReviewRequest(transaction, input.requestId);
      const candidate = await readReviewCandidate(
        transaction,
        input.candidateId,
      );
      if (!candidate) return false;
      const replay = await readReviewReplay(transaction, {
        candidateId: input.candidateId,
        requestId: input.requestId,
        action: 'QUESTION_CANDIDATE_DISCARDED',
      });
      if (
        replay &&
        !isExactReviewReplay(replay, input, 'QUESTION_CANDIDATE_DISCARDED')
      ) {
        throwIdempotencyConflict();
      }
      if (candidate.reviewStatus === 'DISCARDED') {
        return replay !== null;
      }
      if (replay) return false;
      if (
        candidate.reviewStatus !== 'PENDING' ||
        candidate.revision !== input.expectedRevision
      ) {
        return false;
      }

      const nextRevision = candidate.revision + 1;
      const updated = await transaction
        .update(questionProductionCandidates)
        .set({
          reviewStatus: 'DISCARDED',
          revision: nextRevision,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(questionProductionCandidates.id, input.candidateId),
            eq(questionProductionCandidates.reviewStatus, 'PENDING'),
            eq(questionProductionCandidates.revision, input.expectedRevision),
          ),
        )
        .returning({ id: questionProductionCandidates.id });
      if (updated.length !== 1) return false;

      await appendReviewAudit(transaction, {
        command: input,
        action: 'QUESTION_CANDIDATE_DISCARDED',
        summary: {
          expectedRevision: input.expectedRevision,
          previousRevision: candidate.revision,
          revision: nextRevision,
        },
      });
      return true;
    });
  }

  /** 원본 후보를 유지하고 같은 job item을 새 attempt로 다시 queue한다 */
  async requestRegeneration(
    input: RegenerateQuestionCandidateInput,
  ): Promise<{ jobId: string; attempt: number }> {
    const dispatchWriter = this.regenerationDispatchWriter;
    if (!dispatchWriter) {
      throw new Error('QUESTION_REGENERATION_DISPATCH_WRITER_NOT_CONFIGURED');
    }
    return this.database.transaction(async (transaction) => {
      await lockReviewRequest(transaction, input.requestId);
      const candidate = await readReviewCandidate(
        transaction,
        input.candidateId,
      );
      if (!candidate) {
        throw new QuestionCandidateReviewError(
          'QUESTION_CANDIDATE_REVIEW_CONFLICT',
        );
      }

      const replay = await readReviewReplay(transaction, {
        candidateId: input.candidateId,
        requestId: input.requestId,
        action: 'QUESTION_CANDIDATE_REGENERATION_REQUESTED',
      });
      if (
        replay &&
        !isExactReviewReplay(
          replay,
          input,
          'QUESTION_CANDIDATE_REGENERATION_REQUESTED',
        )
      ) {
        throwIdempotencyConflict();
      }
      if (
        replay &&
        typeof replay.summary['jobId'] === 'string' &&
        typeof replay.summary['attempt'] === 'number'
      ) {
        return {
          jobId: replay.summary['jobId'],
          attempt: replay.summary['attempt'],
        };
      }
      if (
        candidate.reviewStatus !== 'PENDING' ||
        candidate.revision !== input.expectedRevision
      ) {
        throw new QuestionCandidateReviewError(
          'QUESTION_CANDIDATE_REVIEW_CONFLICT',
        );
      }

      const [item] = await transaction
        .select({
          id: jobItems.id,
          jobId: jobItems.jobId,
          attempt: jobItems.attempt,
          status: jobItems.status,
          leaseToken: jobItems.leaseToken,
          leaseUntil: jobItems.leaseUntil,
        })
        .from(jobItems)
        .where(eq(jobItems.id, candidate.jobItemId))
        .for('update')
        .limit(1);
      if (!item) {
        throw new QuestionCandidateReviewError(
          'QUESTION_CANDIDATE_REVIEW_CONFLICT',
        );
      }
      if (
        item.attempt !== candidate.jobAttempt ||
        !['SUCCEEDED', 'NEEDS_ATTENTION', 'FAILED'].includes(item.status) ||
        item.leaseToken !== null ||
        item.leaseUntil !== null
      ) {
        throwReviewConflict();
      }

      const [job] = await transaction
        .select({
          id: jobs.id,
          attempt: jobs.attempt,
          status: jobs.status,
        })
        .from(jobs)
        .where(eq(jobs.id, item.jobId))
        .for('update')
        .limit(1);
      if (!job) {
        throw new QuestionCandidateReviewError(
          'QUESTION_CANDIDATE_REVIEW_CONFLICT',
        );
      }
      if (
        job.attempt !== item.attempt ||
        !['COMPLETED', 'COMPLETED_WITH_FAILURES', 'FAILED'].includes(job.status)
      ) {
        throwReviewConflict();
      }

      const nextAttempt = item.attempt + 1;
      const updatedItem = await transaction
        .update(jobItems)
        .set({
          status: 'PENDING',
          attempt: nextAttempt,
          retryable: false,
          errorCode: null,
          leaseUntil: null,
          leaseToken: null,
          result: { regeneratedFromCandidateId: candidate.id },
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(jobItems.id, item.id),
            eq(jobItems.attempt, item.attempt),
            eq(jobItems.status, item.status),
            isNull(jobItems.leaseToken),
            isNull(jobItems.leaseUntil),
          ),
        )
        .returning({ id: jobItems.id });
      if (updatedItem.length !== 1) {
        throw new QuestionCandidateReviewError(
          'QUESTION_CANDIDATE_REVIEW_CONFLICT',
        );
      }

      const updatedJob = await transaction
        .update(jobs)
        .set({
          status: 'QUEUED',
          attempt: nextAttempt,
          enqueuedAt: null,
          completedAt: null,
          failureCode: null,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(jobs.id, job.id),
            eq(jobs.attempt, job.attempt),
            eq(jobs.status, job.status),
          ),
        )
        .returning({ id: jobs.id });
      if (updatedJob.length !== 1) {
        throwReviewConflict();
      }

      const updatedCandidate = await transaction
        .update(questionProductionCandidates)
        .set({
          revision: candidate.revision + 1,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(questionProductionCandidates.id, candidate.id),
            eq(questionProductionCandidates.revision, candidate.revision),
            eq(questionProductionCandidates.reviewStatus, 'PENDING'),
          ),
        )
        .returning({ id: questionProductionCandidates.id });
      if (updatedCandidate.length !== 1) {
        throwReviewConflict();
      }
      await dispatchWriter.enqueue(transaction, {
        destination: 'CONTENT_PRODUCTION',
        jobId: item.jobId,
        attempt: nextAttempt,
        requestedAt: input.occurredAt,
      });
      await appendReviewAudit(transaction, {
        command: input,
        action: 'QUESTION_CANDIDATE_REGENERATION_REQUESTED',
        summary: {
          expectedRevision: input.expectedRevision,
          jobId: item.jobId,
          attempt: nextAttempt,
          regeneratedFromCandidateId: candidate.id,
        },
      });
      return { jobId: item.jobId, attempt: nextAttempt };
    });
  }

  /** 동일 artifact replay는 unique key로 흡수하고 stage별 검증도 한 번만 기록한다 */
  async persist(
    input: Parameters<QuestionProductionCandidateRepository['persist']>[0],
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const finishedAt = this.now();
      const { result = {}, ...terminalOutcome } = input.outcome;
      const terminal = await transaction
        .update(jobItems)
        .set({
          ...terminalOutcome,
          // 재생성 lineage는 terminal 집계와 합쳐 새 후보 artifact까지 전달한다.
          result: sql`coalesce(${jobItems.result}, '{}'::jsonb) || ${JSON.stringify(result)}::jsonb`,
          leaseUntil: null,
          leaseToken: null,
          updatedAt: finishedAt,
        })
        .where(
          and(
            eq(jobItems.jobId, input.jobId),
            eq(jobItems.id, input.itemId),
            eq(jobItems.attempt, input.attempt),
            eq(jobItems.status, 'PROCESSING'),
            eq(jobItems.leaseToken, input.leaseToken),
            gt(jobItems.leaseUntil, finishedAt),
          ),
        )
        .returning({ id: jobItems.id, result: jobItems.result });
      if (terminal.length === 0) return false;

      if (input.artifacts.candidates.length === 0) return true;

      const regeneratedFromCandidateId =
        typeof terminal[0]?.result?.['regeneratedFromCandidateId'] === 'string'
          ? terminal[0].result['regeneratedFromCandidateId']
          : null;
      const inserted = await transaction
        .insert(questionProductionCandidates)
        .values(candidateValues(input, regeneratedFromCandidateId))
        .onConflictDoNothing()
        .returning({
          id: questionProductionCandidates.id,
          ordinal: questionProductionCandidates.ordinal,
        });
      const candidateIds = new Map(
        inserted.map((candidate) => [candidate.ordinal, candidate.id]),
      );
      if (candidateIds.size !== input.artifacts.candidates.length) {
        for (const [ordinal, id] of await existingCandidateIds(
          transaction,
          input,
        )) {
          candidateIds.set(ordinal, id);
        }
      }

      await persistValidations(
        transaction,
        input.artifacts.validations,
        candidateIds,
      );
      return true;
    });
  }

  /** 활성 item lease에서 공유 provider run key를 한 번만 claim한다 */
  async claim(
    execution: QuestionProductionProviderExecution,
  ): ReturnType<QuestionProductionProviderRunRepository['claim']> {
    return this.database.transaction(async (transaction) => {
      const claimedAt = this.now();
      const [activeItem] = await transaction
        .select({ id: jobItems.id })
        .from(jobItems)
        .where(
          and(
            eq(jobItems.id, execution.jobItemId),
            eq(jobItems.attempt, execution.jobAttempt),
            eq(jobItems.status, 'PROCESSING'),
            eq(jobItems.leaseToken, execution.itemLeaseToken),
            gt(jobItems.leaseUntil, claimedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!activeItem) return { kind: 'OUTCOME_UNKNOWN' };

      const existing = await readProviderExecution(transaction, execution);
      if (existing) {
        if (
          existing.status === 'STARTED' &&
          existing.itemLeaseToken !== execution.itemLeaseToken
        ) {
          await transaction
            .update(providerRuns)
            .set({
              status: 'OUTCOME_UNKNOWN',
              success: false,
              retryable: true,
              errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
              finishedAt: claimedAt,
            })
            .where(
              and(
                eq(providerRuns.id, existing.id),
                eq(providerRuns.status, 'STARTED'),
              ),
            );
        }
        return replayProviderResult(existing)!;
      }

      const [inserted] = await transaction
        .insert(providerRuns)
        .values({
          jobItemId: execution.jobItemId,
          operation: execution.operation,
          sequence: execution.sequence,
          provider: execution.provider,
          model: execution.model,
          promptVersion: execution.promptVersion,
          itemLeaseToken: execution.itemLeaseToken,
          attempt: execution.jobAttempt,
          status: 'STARTED',
          startedAt: claimedAt,
        })
        .onConflictDoNothing()
        .returning({ id: providerRuns.id });
      if (inserted) return { kind: 'CLAIMED', runId: inserted.id };

      return (
        replayProviderResult(
          await readProviderExecution(transaction, execution),
        ) ?? { kind: 'OUTCOME_UNKNOWN' }
      );
    });
  }

  /** STARTED 문제 provider 실행 하나만 정규화 성공으로 닫는다 */
  async succeed(
    runId: string,
    result: QuestionProductionProviderResult,
  ): Promise<boolean> {
    const {
      usage = {},
      estimatedCostUsd = '0',
      providerRequestId = null,
      ...normalizedResult
    } = result;
    const rows = await this.database
      .update(providerRuns)
      .set({
        status: 'SUCCEEDED',
        success: true,
        result: normalizedResult,
        usage,
        estimatedCostUsd,
        providerRequestId,
        retryable: false,
        errorCode: null,
        finishedAt: this.now(),
      })
      .where(
        and(eq(providerRuns.id, runId), eq(providerRuns.status, 'STARTED')),
      )
      .returning({ id: providerRuns.id });
    return rows.length === 1;
  }

  /** STARTED 문제 provider 실행 하나만 확정 실패 또는 결과 불명으로 닫는다 */
  async fail(
    runId: string,
    failure: QuestionProductionProviderFailure,
  ): Promise<boolean> {
    const rows = await this.database
      .update(providerRuns)
      .set({
        status: failure.status,
        success: false,
        retryable: failure.retryable,
        errorCode: failure.errorCode,
        finishedAt: this.now(),
      })
      .where(
        and(eq(providerRuns.id, runId), eq(providerRuns.status, 'STARTED')),
      )
      .returning({ id: providerRuns.id });
    return rows.length === 1;
  }
}
