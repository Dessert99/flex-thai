/** TTS 작업·음성 재사용·대상 연결을 Drizzle transaction으로 저장한다 */
import { randomUUID } from 'node:crypto';
import {
  aggregateTtsJobStatus,
  completeTtsItem,
  createTtsCacheKey,
  failTtsItem,
  retryTtsItems,
  type CreateTtsJobInput,
  type RetryTtsItemsInput,
  type TtsFailureInput,
  type TtsJob,
  type TtsSuccessInput,
  type TtsWorkItem,
} from '../../../../domain/src/media/tts-job.js';
import type { TtsTargetAttachmentRepository } from '../../../../domain/src/media/tts-provider.js';
import { and, eq, inArray, lte, or } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { ttsAudioCache, ttsItems, ttsJobs } from '../../schema/tts.schema.js';

type TtsDatabase = PgDatabase<PgQueryResultHKT>;
type TtsTransaction = Parameters<Parameters<TtsDatabase['transaction']>[0]>[0];
type TtsItemRow = typeof ttsItems.$inferSelect;

const leaseDurationMs = 5 * 60 * 1000;

/** TTS worker가 필요로 하는 작업·음성 재사용 저장 경계 */
export interface TtsRepository {
  createJob(input: CreateTtsJobInput): Promise<TtsJob>;
  claimNext(jobId: string, now: Date): Promise<TtsWorkItem | null>;
  claimAudio(
    cacheKey: string,
  ): Promise<
    | { kind: 'GENERATE'; claimToken: string }
    | { kind: 'REUSE'; mediaAssetId: string }
    | { kind: 'OUTCOME_UNKNOWN' }
  >;
  succeed(input: TtsSuccessInput): Promise<boolean>;
  fail(input: TtsFailureInput): Promise<boolean>;
  retry(input: RetryTtsItemsInput): Promise<number>;
}

class StaleTargetAttachmentError extends Error {}

const toItem = (row: TtsItemRow) => ({
  id: row.id,
  jobId: row.jobId,
  target: {
    kind: row.targetKind,
    targetId: row.targetId,
    text: row.targetText,
    required: row.targetRequired,
    revision: row.revision,
  },
  voice: row.voiceSnapshot,
  cacheKey: row.cacheKey,
  status: row.status,
  attempt: row.attempt,
  leaseToken: row.leaseToken,
  leaseUntil: row.leaseUntil,
  errorCode: row.errorCode,
  retryable: row.retryable,
  mediaAssetId: row.mediaAssetId,
});

const toWorkItem = (row: TtsItemRow): TtsWorkItem => {
  if (row.leaseToken === null || row.leaseUntil === null) {
    throw new Error('TTS_ITEM_LEASE_MISSING');
  }
  const item = toItem(row);
  return {
    jobId: item.jobId,
    itemId: item.id,
    attempt: item.attempt,
    leaseToken: row.leaseToken,
    leaseUntil: row.leaseUntil,
    target: item.target,
    voice: item.voice,
    cacheKey: item.cacheKey,
  };
};

const toJob = (
  row: typeof ttsJobs.$inferSelect,
  counts: TtsJob['counts'],
): TtsJob => ({
  id: row.id,
  status: row.status,
  requestedBy: row.requestedBy,
  counts,
  createdAt: row.createdAt,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
});

const findActiveItem = async (
  transaction: TtsTransaction,
  item: TtsWorkItem,
  now: Date,
) => {
  const [row] = await transaction
    .select()
    .from(ttsItems)
    .where(
      and(
        eq(ttsItems.id, item.itemId),
        eq(ttsItems.jobId, item.jobId),
        eq(ttsItems.status, 'PROCESSING'),
        eq(ttsItems.attempt, item.attempt),
        eq(ttsItems.leaseToken, item.leaseToken),
        eq(ttsItems.leaseUntil, item.leaseUntil),
      ),
    )
    .for('update')
    .limit(1);
  if (!row || row.leaseUntil === null || row.leaseUntil <= now) return null;
  return row;
};

const refreshJobSummary = async (
  transaction: TtsTransaction,
  jobId: string,
  at: Date,
): Promise<void> => {
  const rows = await transaction
    .select()
    .from(ttsItems)
    .where(eq(ttsItems.jobId, jobId));
  const { counts, status } = aggregateTtsJobStatus(rows.map(toItem));
  const [job] = await transaction
    .select({ id: ttsJobs.id, startedAt: ttsJobs.startedAt })
    .from(ttsJobs)
    .where(eq(ttsJobs.id, jobId))
    .for('update')
    .limit(1);
  if (!job) return;

  await transaction
    .update(ttsJobs)
    .set({
      status,
      pendingCount: counts.pending,
      processingCount: counts.processing,
      succeededCount: counts.succeeded,
      failedCount: counts.failed,
      startedAt: counts.processing > 0 ? (job.startedAt ?? at) : job.startedAt,
      finishedAt: counts.pending === 0 && counts.processing === 0 ? at : null,
      updatedAt: at,
    })
    .where(eq(ttsJobs.id, jobId));
};

/** TTS lease와 cache unique claim을 PostgreSQL 조건부 전이로 구현한다 */
export class DrizzleTtsRepository implements TtsRepository {
  constructor(
    private readonly database: TtsDatabase,
    private readonly targetAttachments: TtsTargetAttachmentRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** immutable target·voice snapshot과 초기 pending count를 함께 만든다 */
  async createJob(input: CreateTtsJobInput): Promise<TtsJob> {
    return this.database.transaction(async (transaction) => {
      const [job] = await transaction
        .insert(ttsJobs)
        .values({
          requestedBy: input.requestedBy,
          voiceSnapshot: input.voice,
          status: 'QUEUED',
          pendingCount: input.targets.length,
          processingCount: 0,
          succeededCount: 0,
          failedCount: 0,
          createdAt: input.requestedAt,
          updatedAt: input.requestedAt,
        })
        .returning();
      if (!job) throw new Error('TTS_JOB_CREATE_FAILED');

      if (input.targets.length > 0) {
        await transaction.insert(ttsItems).values(
          input.targets.map((target) => ({
            jobId: job.id,
            targetKind: target.kind,
            targetId: target.targetId,
            targetText: target.text,
            targetRequired: target.required,
            revision: target.revision,
            voiceSnapshot: input.voice,
            cacheKey: createTtsCacheKey(target.text, input.voice),
            status: 'PENDING' as const,
            attempt: 0,
            createdAt: input.requestedAt,
            updatedAt: input.requestedAt,
          })),
        );
      }
      return toJob(job, {
        pending: input.targets.length,
        processing: 0,
        succeeded: 0,
        failed: 0,
      });
    });
  }

  /** pending 또는 만료 lease 항목 하나를 skip-locked로 새 worker에게 준다 */
  async claimNext(jobId: string, now: Date): Promise<TtsWorkItem | null> {
    return this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select()
        .from(ttsItems)
        .where(
          and(
            eq(ttsItems.jobId, jobId),
            or(
              eq(ttsItems.status, 'PENDING'),
              and(
                eq(ttsItems.status, 'PROCESSING'),
                lte(ttsItems.leaseUntil, now),
              ),
            ),
          ),
        )
        .for('update', { skipLocked: true })
        .limit(1);
      if (!candidate) return null;

      const leaseToken = randomUUID();
      const leaseUntil = new Date(now.getTime() + leaseDurationMs);
      const [claimed] = await transaction
        .update(ttsItems)
        .set({
          status: 'PROCESSING',
          leaseToken,
          leaseUntil,
          updatedAt: now,
        })
        .where(
          and(
            eq(ttsItems.id, candidate.id),
            or(
              eq(ttsItems.status, 'PENDING'),
              and(
                eq(ttsItems.status, 'PROCESSING'),
                lte(ttsItems.leaseUntil, now),
              ),
            ),
          ),
        )
        .returning();
      if (!claimed) return null;
      await refreshJobSummary(transaction, jobId, now);
      return toWorkItem(claimed);
    });
  }

  /** unique cache row의 READY 결과를 재사용하거나 최초 생성만 소유한다 */
  async claimAudio(
    cacheKey: string,
  ): Promise<
    | { kind: 'GENERATE'; claimToken: string }
    | { kind: 'REUSE'; mediaAssetId: string }
    | { kind: 'OUTCOME_UNKNOWN' }
  > {
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(ttsAudioCache)
        .where(eq(ttsAudioCache.cacheKey, cacheKey))
        .for('update')
        .limit(1);
      if (existing) {
        if (existing.status === 'READY' && existing.mediaAssetId !== null) {
          return { kind: 'REUSE', mediaAssetId: existing.mediaAssetId };
        }
        return { kind: 'OUTCOME_UNKNOWN' };
      }

      const claimToken = randomUUID();
      const claimedAt = this.now();
      const [inserted] = await transaction
        .insert(ttsAudioCache)
        .values({
          cacheKey,
          status: 'GENERATING',
          claimToken,
          claimedAt,
          createdAt: claimedAt,
          updatedAt: claimedAt,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return { kind: 'GENERATE', claimToken };

      const [concurrent] = await transaction
        .select()
        .from(ttsAudioCache)
        .where(eq(ttsAudioCache.cacheKey, cacheKey))
        .limit(1);
      if (concurrent?.status === 'READY' && concurrent.mediaAssetId !== null) {
        return { kind: 'REUSE', mediaAssetId: concurrent.mediaAssetId };
      }
      return { kind: 'OUTCOME_UNKNOWN' };
    });
  }

  /** active lease의 cache READY·item 완료·target 연결을 하나의 transaction으로 닫는다 */
  async succeed(input: TtsSuccessInput): Promise<boolean> {
    try {
      return await this.database.transaction(async (transaction) => {
        const current = await findActiveItem(
          transaction,
          input.item,
          input.completedAt,
        );
        if (!current) return false;

        const completed = completeTtsItem(toItem(current), {
          ...input,
          // item lease와 cache 생성 claim은 서로 다른 owner token이다.
          claimToken: input.item.leaseToken,
        });
        const [cache] = await transaction
          .update(ttsAudioCache)
          .set({
            status: 'READY',
            mediaAssetId: input.mediaAssetId,
            readyMetadataRevision: completed.voice.generationRevision,
            readyAt: input.completedAt,
            updatedAt: input.completedAt,
          })
          .where(
            and(
              eq(ttsAudioCache.cacheKey, completed.cacheKey),
              eq(ttsAudioCache.status, 'GENERATING'),
              eq(ttsAudioCache.claimToken, input.claimToken),
            ),
          )
          .returning({ id: ttsAudioCache.id });
        if (!cache) return false;

        const [item] = await transaction
          .update(ttsItems)
          .set({
            status: completed.status,
            leaseToken: null,
            leaseUntil: null,
            errorCode: null,
            retryable: false,
            mediaAssetId: completed.mediaAssetId,
            updatedAt: input.completedAt,
          })
          .where(
            and(
              eq(ttsItems.id, completed.id),
              eq(ttsItems.status, 'PROCESSING'),
              eq(ttsItems.attempt, completed.attempt),
              eq(ttsItems.leaseToken, input.item.leaseToken),
            ),
          )
          .returning({ id: ttsItems.id });
        if (!item) return false;

        if (
          (await this.targetAttachments.attach({
            target: completed.target,
            mediaAssetId: input.mediaAssetId,
            expectedRevision: completed.target.revision,
          })) !== 'ATTACHED'
        ) {
          throw new StaleTargetAttachmentError();
        }
        await refreshJobSummary(
          transaction,
          completed.jobId,
          input.completedAt,
        );
        return true;
      });
    } catch (error) {
      if (error instanceof StaleTargetAttachmentError) return false;
      throw error;
    }
  }

  /** active lease의 공급자 실패만 terminal 실패로 전이한다 */
  async fail(input: TtsFailureInput): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const current = await findActiveItem(
        transaction,
        input.item,
        input.failedAt,
      );
      if (!current) return false;
      const failed = failTtsItem(toItem(current), input);
      const [item] = await transaction
        .update(ttsItems)
        .set({
          status: failed.status,
          leaseToken: null,
          leaseUntil: null,
          errorCode: failed.errorCode,
          retryable: failed.retryable,
          mediaAssetId: null,
          updatedAt: input.failedAt,
        })
        .where(
          and(
            eq(ttsItems.id, failed.id),
            eq(ttsItems.status, 'PROCESSING'),
            eq(ttsItems.attempt, failed.attempt),
            eq(ttsItems.leaseToken, input.item.leaseToken),
          ),
        )
        .returning({ id: ttsItems.id });
      if (!item) return false;
      await refreshJobSummary(transaction, failed.jobId, input.failedAt);
      return true;
    });
  }

  /** optimistic attempt가 맞는 retryable failed 항목만 새 pending attempt로 연다 */
  async retry(input: RetryTtsItemsInput): Promise<number> {
    return this.database.transaction(async (transaction) => {
      if (input.itemIds.length === 0) return 0;
      const rows = await transaction
        .select()
        .from(ttsItems)
        .where(
          and(
            eq(ttsItems.jobId, input.jobId),
            inArray(ttsItems.id, input.itemIds),
          ),
        )
        .for('update');
      const retried = retryTtsItems(rows.map(toItem), input);
      const byId = new Map(retried.map((item) => [item.id, item]));
      for (const itemId of input.itemIds) {
        const item = byId.get(itemId);
        if (!item) continue;
        await transaction
          .update(ttsItems)
          .set({
            status: item.status,
            attempt: item.attempt,
            leaseToken: null,
            leaseUntil: null,
            errorCode: null,
            retryable: false,
            mediaAssetId: null,
            updatedAt: input.requestedAt,
          })
          .where(
            and(
              eq(ttsItems.id, item.id),
              eq(ttsItems.status, 'FAILED'),
              eq(ttsItems.attempt, item.attempt - 1),
              eq(ttsItems.retryable, true),
            ),
          );
      }
      await refreshJobSummary(transaction, input.jobId, input.requestedAt);
      return input.itemIds.length;
    });
  }
}
