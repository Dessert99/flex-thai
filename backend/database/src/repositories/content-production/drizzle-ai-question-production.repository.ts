/** AI 문제 후보 artifact와 item terminal 전이를 같은 PostgreSQL transaction으로 저장한다 */
import { isDeepStrictEqual } from 'node:util';
import { and, eq, gt } from 'drizzle-orm';
import type {
  QuestionProductionCandidateRepository,
  QuestionProductionProviderExecution,
  QuestionProductionProviderFailure,
  QuestionProductionProviderResult,
  QuestionProductionProviderRunRepository,
  QuestionProductionValidationRecord,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  questionProductionCandidates,
  questionProductionValidations,
} from '../../schema/ai-question-production.schema.js';
import { jobItems, providerRuns } from '../../schema/jobs.schema.js';
import * as schema from '../../schema/index.js';

type QuestionProductionDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type QuestionProductionTransaction = Parameters<
  Parameters<QuestionProductionDatabase['transaction']>[0]
>[0];

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
) =>
  input.artifacts.candidates.map((record) => ({
    jobItemId: input.itemId,
    jobAttempt: input.attempt,
    ordinal: record.ordinal,
    typeVersionId: record.candidate.questionTypeVersionId,
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
        topicId: questionProductionCandidates.topicId,
        difficulty: questionProductionCandidates.difficulty,
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
      topicId: record.candidate.topicId,
      difficulty: record.candidate.difficulty,
      payloadHash: record.payloadHash,
      resultGroup: record.resultGroup,
      reviewStatus: record.reviewStatus,
      reviewCode: record.reviewCode,
      regeneratedFromCandidateId: record.regeneratedFromCandidateId,
      approvedQuestionId: record.approvedQuestionId,
      approvedQuestionVersionId: record.approvedQuestionVersionId,
    };
    const { id, ordinal, ...actual } = existing;
    if (!isDeepStrictEqual(actual, expected)) {
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
    QuestionProductionProviderRunRepository
{
  constructor(
    private readonly database: QuestionProductionDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 동일 artifact replay는 unique key로 흡수하고 stage별 검증도 한 번만 기록한다 */
  async persist(
    input: Parameters<QuestionProductionCandidateRepository['persist']>[0],
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const finishedAt = this.now();
      const terminal = await transaction
        .update(jobItems)
        .set({
          ...input.outcome,
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
        .returning({ id: jobItems.id });
      if (terminal.length === 0) return false;

      if (input.artifacts.candidates.length === 0) return true;

      const inserted = await transaction
        .insert(questionProductionCandidates)
        .values(candidateValues(input))
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
