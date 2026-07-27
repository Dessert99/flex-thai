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
  type TtsTargetSnapshot,
  type TtsWorkItem,
} from '@flex-thia/domain';
import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { mediaAssets } from '../../schema/media.schema.js';
import { ttsAudioCache, ttsItems, ttsJobs } from '../../schema/tts.schema.js';

type TtsDatabase = PgDatabase<PgQueryResultHKT>;
/** TTS target 연결 구현이 같은 DB transaction을 사용하도록 전달하는 session */
export type TtsRepositoryTransaction = Parameters<
  Parameters<TtsDatabase['transaction']>[0]
>[0];
type TtsItemRow = typeof ttsItems.$inferSelect;

const leaseDurationMs = 5 * 60 * 1000;
/** GENERATING claim이 무한 WAIT로 남지 않게 불명확 결과로 닫는 상한 */
export const ttsAudioGenerationClaimTtlMs = 5 * 60 * 1000;

/** 생성 완료와 READY 재사용 완료를 cache 소유권 유무로 구분한다 */
export type CompleteTtsAudioInput =
  | {
      kind: 'GENERATED';
      item: TtsWorkItem;
      claimToken: string;
      media: {
        storageKey: string;
        mimeType: 'audio/wav';
        sizeBytes: number;
        sha256: string;
      };
      completedAt: Date;
    }
  | {
      kind: 'REUSED';
      item: TtsWorkItem;
      mediaAssetId: string;
      completedAt: Date;
    };

/** cache 생성 claim의 known 실패 해제와 불명확 결과 고정을 구분한다 */
export type TtsAudioClaimFinalization = {
  claimToken: string;
  resolution: 'RELEASE' | 'OUTCOME_UNKNOWN';
};

/** TTS 완료 transaction이 거절된 정확한 소유권·대상 이유 */
export type CompleteTtsAudioResult =
  | { kind: 'COMPLETED'; mediaAssetId: string }
  | {
      kind:
        'STALE_LEASE' | 'STALE_CACHE_CLAIM' | 'STALE_TARGET' | 'MEDIA_CONFLICT';
    };

/** TTS 실패 transaction이 실제 item을 닫았는지 구분한다 */
export type FailTtsAudioResult =
  { kind: 'FAILED' } | { kind: 'STALE_LEASE' | 'STALE_CACHE_CLAIM' };

/** target 연결 SQL을 repository transaction 안에서 실행하는 DB-local writer */
export interface TtsTargetAttachmentWriter {
  attach(
    transaction: TtsRepositoryTransaction,
    input: {
      target: TtsTargetSnapshot;
      mediaAssetId: string;
      expectedRevision: string;
    },
  ): Promise<'ATTACHED' | 'STALE_TARGET'>;
}

/** TTS worker가 필요로 하는 작업·음성 재사용 저장 경계 */
export interface TtsRepository {
  createJob(input: CreateTtsJobInput): Promise<TtsJob>;
  claimNext(jobId: string, now: Date): Promise<TtsWorkItem | null>;
  claimAudio(
    cacheKey: string,
  ): Promise<
    | { kind: 'GENERATE'; claimToken: string }
    | { kind: 'REUSE'; mediaAssetId: string }
    | { kind: 'WAIT' }
    | { kind: 'OUTCOME_UNKNOWN' }
  >;
  succeed(input: CompleteTtsAudioInput): Promise<CompleteTtsAudioResult>;
  fail(
    input: TtsFailureInput & { audioClaim?: TtsAudioClaimFinalization },
  ): Promise<FailTtsAudioResult>;
  finalizeAudioClaim(
    cacheKey: string,
    audioClaim: TtsAudioClaimFinalization,
    finalizedAt: Date,
  ): Promise<'FINALIZED' | 'STALE_CACHE_CLAIM'>;
  getJobStatus(jobId: string): Promise<TtsJob['status'] | null>;
  retry(input: RetryTtsItemsInput): Promise<number>;
}

class StaleTargetAttachmentError extends Error {}
class StaleTtsLeaseError extends Error {}
class StaleTtsCacheClaimError extends Error {}
class TtsMediaImmutableConflictError extends Error {
  constructor() {
    super('TTS_MEDIA_IMMUTABLE_CONFLICT');
    this.name = 'TtsMediaImmutableConflictError';
  }
}

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
  transaction: TtsRepositoryTransaction,
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
  transaction: TtsRepositoryTransaction,
  jobId: string,
  at: Date,
): Promise<void> => {
  const [job] = await transaction
    .select({ id: ttsJobs.id, startedAt: ttsJobs.startedAt })
    .from(ttsJobs)
    .where(eq(ttsJobs.id, jobId))
    .for('update')
    .limit(1);
  if (!job) return;

  // job lock 뒤의 새 statement snapshot으로 모든 item terminal 전이를 포함한다.
  const rows = await transaction
    .select()
    .from(ttsItems)
    .where(eq(ttsItems.jobId, jobId));
  const { counts, status } = aggregateTtsJobStatus(rows.map(toItem));

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

const isExactReadyMedia = (
  row: typeof mediaAssets.$inferSelect,
  media: Extract<CompleteTtsAudioInput, { kind: 'GENERATED' }>['media'],
): boolean =>
  row.status === 'READY' &&
  row.declaredMimeType === media.mimeType &&
  row.declaredSizeBytes === media.sizeBytes &&
  row.declaredSha256 === media.sha256 &&
  row.mimeType === media.mimeType &&
  row.sizeBytes === media.sizeBytes &&
  row.sha256 === media.sha256;

const persistGeneratedMedia = async (
  transaction: TtsRepositoryTransaction,
  input: Extract<CompleteTtsAudioInput, { kind: 'GENERATED' }>,
): Promise<string> => {
  const [inserted] = await transaction
    .insert(mediaAssets)
    .values({
      storageKey: input.media.storageKey,
      declaredMimeType: input.media.mimeType,
      declaredSizeBytes: input.media.sizeBytes,
      declaredSha256: input.media.sha256,
      mimeType: input.media.mimeType,
      sizeBytes: input.media.sizeBytes,
      sha256: input.media.sha256,
      status: 'READY',
      readyAt: input.completedAt,
      createdAt: input.completedAt,
    })
    .onConflictDoNothing()
    .returning({ id: mediaAssets.id });
  if (inserted) return inserted.id;

  const [existing] = await transaction
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.storageKey, input.media.storageKey))
    .for('update')
    .limit(1);
  if (!existing || !isExactReadyMedia(existing, input.media)) {
    throw new TtsMediaImmutableConflictError();
  }
  return existing.id;
};

const finalizeOwnedAudioClaim = async (
  transaction: TtsRepositoryTransaction,
  cacheKey: string,
  audioClaim: TtsAudioClaimFinalization,
  finalizedAt: Date,
): Promise<boolean> => {
  const [claim] = await transaction
    .select()
    .from(ttsAudioCache)
    .where(
      and(
        eq(ttsAudioCache.cacheKey, cacheKey),
        eq(ttsAudioCache.status, 'GENERATING'),
        eq(ttsAudioCache.claimToken, audioClaim.claimToken),
      ),
    )
    .for('update')
    .limit(1);
  if (!claim) return false;

  if (audioClaim.resolution === 'RELEASE') {
    await transaction
      .delete(ttsAudioCache)
      .where(
        and(
          eq(ttsAudioCache.cacheKey, cacheKey),
          eq(ttsAudioCache.status, 'GENERATING'),
          eq(ttsAudioCache.claimToken, audioClaim.claimToken),
        ),
      );
    return true;
  }

  const [finalized] = await transaction
    .update(ttsAudioCache)
    .set({
      status: 'OUTCOME_UNKNOWN',
      claimToken: null,
      updatedAt: finalizedAt,
    })
    .where(
      and(
        eq(ttsAudioCache.cacheKey, cacheKey),
        eq(ttsAudioCache.status, 'GENERATING'),
        eq(ttsAudioCache.claimToken, audioClaim.claimToken),
      ),
    )
    .returning({ id: ttsAudioCache.id });
  return finalized !== undefined;
};

const resolveExistingAudioClaim = async (
  transaction: TtsRepositoryTransaction,
  row: typeof ttsAudioCache.$inferSelect,
  now: Date,
): Promise<
  | { kind: 'REUSE'; mediaAssetId: string }
  | { kind: 'WAIT' }
  | { kind: 'OUTCOME_UNKNOWN' }
> => {
  if (row.status === 'READY' && row.mediaAssetId !== null) {
    return { kind: 'REUSE', mediaAssetId: row.mediaAssetId };
  }
  if (row.status === 'OUTCOME_UNKNOWN') return { kind: 'OUTCOME_UNKNOWN' };
  if (
    row.claimedAt !== null &&
    row.claimedAt.getTime() > now.getTime() - ttsAudioGenerationClaimTtlMs
  ) {
    return { kind: 'WAIT' };
  }

  const [expired] = await transaction
    .update(ttsAudioCache)
    .set({
      status: 'OUTCOME_UNKNOWN',
      claimToken: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(ttsAudioCache.id, row.id),
        eq(ttsAudioCache.status, 'GENERATING'),
        row.claimToken === null
          ? isNull(ttsAudioCache.claimToken)
          : eq(ttsAudioCache.claimToken, row.claimToken),
        row.claimedAt === null
          ? isNull(ttsAudioCache.claimedAt)
          : eq(ttsAudioCache.claimedAt, row.claimedAt),
      ),
    )
    .returning({ id: ttsAudioCache.id });
  return expired ? { kind: 'OUTCOME_UNKNOWN' } : { kind: 'WAIT' };
};

/** TTS lease와 cache unique claim을 PostgreSQL 조건부 전이로 구현한다 */
export class DrizzleTtsRepository implements TtsRepository {
  constructor(
    private readonly database: TtsDatabase,
    private readonly targetAttachments: TtsTargetAttachmentWriter,
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
    | { kind: 'WAIT' }
    | { kind: 'OUTCOME_UNKNOWN' }
  > {
    const claimedAt = this.now();
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(ttsAudioCache)
        .where(eq(ttsAudioCache.cacheKey, cacheKey))
        .for('update')
        .limit(1);
      if (existing) {
        return resolveExistingAudioClaim(transaction, existing, claimedAt);
      }

      const claimToken = randomUUID();
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
        .for('update')
        .limit(1);
      return concurrent
        ? resolveExistingAudioClaim(transaction, concurrent, claimedAt)
        : { kind: 'WAIT' };
    });
  }

  /** active lease의 cache READY·item 완료·target 연결을 하나의 transaction으로 닫는다 */
  async succeed(input: CompleteTtsAudioInput): Promise<CompleteTtsAudioResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        const current = await findActiveItem(
          transaction,
          input.item,
          input.completedAt,
        );
        if (!current) return { kind: 'STALE_LEASE' };

        const mediaAssetId =
          input.kind === 'GENERATED'
            ? await persistGeneratedMedia(transaction, input)
            : input.mediaAssetId;
        const completed = completeTtsItem(toItem(current), {
          item: input.item,
          mediaAssetId,
          completedAt: input.completedAt,
          // item lease와 cache 생성 claim은 서로 다른 owner token이다.
          claimToken: input.item.leaseToken,
        });
        if (input.kind === 'GENERATED') {
          const [cache] = await transaction
            .update(ttsAudioCache)
            .set({
              status: 'READY',
              audioDigest: input.media.sha256,
              mediaAssetId,
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
          if (!cache) throw new StaleTtsCacheClaimError();
        } else {
          const [cache] = await transaction
            .select({ id: ttsAudioCache.id })
            .from(ttsAudioCache)
            .where(
              and(
                eq(ttsAudioCache.cacheKey, completed.cacheKey),
                eq(ttsAudioCache.status, 'READY'),
                eq(ttsAudioCache.mediaAssetId, mediaAssetId),
              ),
            )
            .for('update')
            .limit(1);
          if (!cache) throw new StaleTtsCacheClaimError();
        }

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
        if (!item) throw new StaleTtsLeaseError();

        if (
          (await this.targetAttachments.attach(transaction, {
            target: completed.target,
            mediaAssetId,
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
        return { kind: 'COMPLETED', mediaAssetId };
      });
    } catch (error) {
      if (error instanceof StaleTargetAttachmentError) {
        return { kind: 'STALE_TARGET' };
      }
      if (error instanceof StaleTtsLeaseError) return { kind: 'STALE_LEASE' };
      if (error instanceof StaleTtsCacheClaimError) {
        return { kind: 'STALE_CACHE_CLAIM' };
      }
      if (error instanceof TtsMediaImmutableConflictError) {
        return { kind: 'MEDIA_CONFLICT' };
      }
      throw error;
    }
  }

  /** cache claim을 먼저 안전하게 닫고 active item만 terminal 실패로 전이한다 */
  async fail(
    input: TtsFailureInput & { audioClaim?: TtsAudioClaimFinalization },
  ): Promise<FailTtsAudioResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        const current = await findActiveItem(
          transaction,
          input.item,
          input.failedAt,
        );
        if (input.audioClaim) {
          if (
            !(await finalizeOwnedAudioClaim(
              transaction,
              input.item.cacheKey,
              input.audioClaim,
              input.failedAt,
            ))
          ) {
            return { kind: 'STALE_CACHE_CLAIM' };
          }
        }
        if (!current) return { kind: 'STALE_LEASE' };

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
        if (!item) throw new StaleTtsLeaseError();
        await refreshJobSummary(transaction, failed.jobId, input.failedAt);
        return { kind: 'FAILED' };
      });
    } catch (error) {
      if (error instanceof StaleTtsLeaseError) return { kind: 'STALE_LEASE' };
      if (error instanceof StaleTtsCacheClaimError) {
        return { kind: 'STALE_CACHE_CLAIM' };
      }
      throw error;
    }
  }

  /** stale item을 건드리지 않고 token 소유자의 cache claim만 종료한다 */
  async finalizeAudioClaim(
    cacheKey: string,
    audioClaim: TtsAudioClaimFinalization,
    finalizedAt: Date,
  ): Promise<'FINALIZED' | 'STALE_CACHE_CLAIM'> {
    return this.database.transaction(async (transaction) =>
      (await finalizeOwnedAudioClaim(
        transaction,
        cacheKey,
        audioClaim,
        finalizedAt,
      ))
        ? 'FINALIZED'
        : 'STALE_CACHE_CLAIM',
    );
  }

  /** worker가 local 추정 대신 transaction이 저장한 canonical job 상태를 읽는다 */
  async getJobStatus(jobId: string): Promise<TtsJob['status'] | null> {
    const [job] = await this.database
      .select({ status: ttsJobs.status })
      .from(ttsJobs)
      .where(eq(ttsJobs.id, jobId))
      .limit(1);
    return job?.status ?? null;
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
