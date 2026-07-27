/** AI 문제 후보 artifact와 item terminal 전이를 같은 PostgreSQL transaction으로 저장한다 */
import { and, eq, gt } from 'drizzle-orm';
import type {
  QuestionProductionCandidateRepository,
  QuestionProductionValidationRecord,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  questionProductionCandidates,
  questionProductionValidations,
} from '../../schema/ai-question-production.schema.js';
import { jobItems } from '../../schema/jobs.schema.js';
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
    reviewCode: record.reviewCode,
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
    ids.set(existing.ordinal, existing.id);
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

/** lease 조건을 충족할 때만 문제 후보·검증 결과와 terminal item을 함께 확정한다 */
export class DrizzleAiQuestionProductionRepository implements QuestionProductionCandidateRepository {
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

      if (input.artifacts.validations.length > 0) {
        await transaction
          .insert(questionProductionValidations)
          .values(validationValues(input.artifacts.validations, candidateIds))
          .onConflictDoNothing();
      }
      return true;
    });
  }
}
