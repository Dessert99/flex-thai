/** AI 어휘 후보와 provider 실행을 PostgreSQL 조건부 전이로 저장한다 */
import { and, eq, gt } from 'drizzle-orm';
import type {
  VocabularyProviderExecution,
  VocabularyProviderFailure,
  VocabularyProviderNormalizedResult,
  VocabularyProviderRunRepository,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { jobItems, providerRuns } from '../../schema/jobs.schema.js';

type AiVocabularyDatabase = PgDatabase<PgQueryResultHKT>;
type AiVocabularyTransaction = Parameters<
  Parameters<AiVocabularyDatabase['transaction']>[0]
>[0];

const executionWhere = (execution: VocabularyProviderExecution) =>
  and(
    eq(providerRuns.jobItemId, execution.jobItemId),
    eq(providerRuns.attempt, execution.jobAttempt),
    eq(providerRuns.operation, execution.operation),
    eq(providerRuns.sequence, execution.sequence),
  );

const readExecution = async (
  transaction: AiVocabularyTransaction,
  execution: VocabularyProviderExecution,
) => {
  const [run] = await transaction
    .select({
      id: providerRuns.id,
      status: providerRuns.status,
      result: providerRuns.result,
      itemLeaseToken: providerRuns.itemLeaseToken,
    })
    .from(providerRuns)
    .where(executionWhere(execution))
    .limit(1);
  return run;
};

const replayClaim = (
  run: Awaited<ReturnType<typeof readExecution>>,
):
  | { kind: 'REPLAY'; result: VocabularyProviderNormalizedResult }
  | { kind: 'OUTCOME_UNKNOWN' }
  | null => {
  if (!run) {
    return null;
  }

  if (run.status === 'SUCCEEDED' && run.result) {
    return {
      kind: 'REPLAY',
      result: run.result as VocabularyProviderNormalizedResult,
    };
  }

  return { kind: 'OUTCOME_UNKNOWN' };
};

/** provider 실행 unique key로 같은 attempt의 외부 재호출을 차단한다 */
export class DrizzleAiVocabularyProductionRepository implements VocabularyProviderRunRepository {
  constructor(
    private readonly database: AiVocabularyDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 새 실행을 claim하거나 저장된 terminal 결과를 재사용한다 */
  async claim(
    execution: VocabularyProviderExecution,
  ): ReturnType<VocabularyProviderRunRepository['claim']> {
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
      if (!activeItem) {
        return { kind: 'OUTCOME_UNKNOWN' };
      }

      const existing = await readExecution(transaction, execution);

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

        return replayClaim(existing) ?? { kind: 'OUTCOME_UNKNOWN' };
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

      if (inserted) {
        return { kind: 'CLAIMED', runId: inserted.id };
      }

      const concurrent = await readExecution(transaction, execution);
      return replayClaim(concurrent) ?? { kind: 'OUTCOME_UNKNOWN' };
    });
  }

  /** STARTED 실행 하나만 normalized 성공으로 닫는다 */
  async succeed(
    runId: string,
    result: VocabularyProviderNormalizedResult,
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

  /** STARTED 실행 하나만 확정 실패 또는 결과 불명으로 닫는다 */
  async fail(
    runId: string,
    failure: VocabularyProviderFailure,
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
