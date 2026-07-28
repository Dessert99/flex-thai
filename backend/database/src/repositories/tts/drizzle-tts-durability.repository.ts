/** TTS provider outcome exact-once와 orphan audio 참조 확인형 GC를 저장한다 */
import { randomUUID } from 'node:crypto';
import type { TtsWorkItem } from '@flex-thia/domain';
import { and, eq, gt, lte, or } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { vocabularyPracticeQuestions } from '../../schema/learning-practice.schema.js';
import { mediaAssets } from '../../schema/media.schema.js';
import { thaiSentenceVersions } from '../../schema/thai-content.schema.js';
import {
  ttsAudioCache,
  ttsAudioGcRecords,
  ttsItems,
  ttsProviderRuns,
} from '../../schema/tts.schema.js';
import { vocabularyPronunciations } from '../../schema/vocabulary.schema.js';

type TtsDurabilityDatabase = PgDatabase<PgQueryResultHKT>;
/** pre-write GC intent가 정상 object write와 경쟁하지 않게 하는 최소 유예 */
export const ttsAudioGcWriteGraceMs = 5 * 60 * 1000;
/** READY commit과 GC claim이 같은 row lock을 쓰게 하는 transaction 타입 */
export type TtsDurabilityTransaction = Parameters<
  Parameters<TtsDurabilityDatabase['transaction']>[0]
>[0];

/** object store가 반환하고 DB가 검증하는 immutable audio metadata */
export interface TtsStoredAudio {
  storageKey: string;
  mimeType: 'audio/wav';
  sizeBytes: number;
  sha256: string;
}

/** provider 실행을 시작하기 전 item·cache 소유권 snapshot */
export interface ClaimTtsProviderRunInput {
  item: Pick<TtsWorkItem, 'itemId' | 'attempt' | 'leaseToken'>;
  cacheKey: string;
  cacheClaimToken: string;
  provider: string;
  model: string;
  claimedAt: Date;
}

/** DB에 저장된 provider terminal 결과를 재호출 없이 복구하는 결과 */
export type TtsProviderRunReplay =
  | {
      kind: 'SUCCEEDED';
      runId: string;
      cacheClaimToken: string;
      usage: Record<string, number>;
      estimatedCostUsd: string;
      providerRequestId: string | null;
      media: TtsStoredAudio;
    }
  | {
      kind: 'FAILED';
      runId: string;
      cacheClaimToken: string;
      errorCode: string;
      retryable: boolean;
    }
  | {
      kind: 'OUTCOME_UNKNOWN';
      runId?: string;
      cacheClaimToken: string;
    }
  | {
      kind: 'IN_PROGRESS';
      runId: string;
      cacheClaimToken: string;
    };

/** provider 실행 claim이 새 호출 소유권인지 저장 결과 replay인지 구분한다 */
export type ClaimTtsProviderRunResult =
  { kind: 'CLAIMED'; runId: string } | TtsProviderRunReplay;

/** GC worker가 object side effect를 수행할 때 가진 lease snapshot */
export interface ClaimedTtsAudioGc {
  id: string;
  leaseOwner: string;
  media: TtsStoredAudio;
}

/** 저장 경계가 원문을 노출하지 않는 안정적인 TTS durability 오류 */
export class TtsDurabilityError extends Error {
  /** 호출자가 retry·운영 분류에 사용할 bounded code를 보존한다 */
  constructor(readonly code: string) {
    super(code);
    this.name = 'TtsDurabilityError';
  }
}

const safeErrorCodePattern = /^[A-Z][A-Z0-9_]{0,95}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/u;

const safeErrorCode = (value: string, fallback: string): string =>
  safeErrorCodePattern.test(value) ? value : fallback;

const assertStoredAudio = (media: TtsStoredAudio): void => {
  if (
    media.storageKey.length === 0 ||
    media.storageKey.length > 1024 ||
    media.mimeType !== 'audio/wav' ||
    !Number.isSafeInteger(media.sizeBytes) ||
    media.sizeBytes <= 0 ||
    !sha256Pattern.test(media.sha256)
  ) {
    throw new TtsDurabilityError('TTS_AUDIO_METADATA_INVALID');
  }
};

const normalizeUsage = (
  usage: Record<string, number>,
): Record<string, number> => {
  const entries = Object.entries(usage);
  if (
    entries.some(
      ([key, value]) =>
        !safeErrorCodePattern.test(key.toUpperCase()) ||
        !Number.isFinite(value) ||
        value < 0,
    )
  ) {
    throw new TtsDurabilityError('TTS_PROVIDER_USAGE_INVALID');
  }
  return Object.fromEntries(entries);
};

const toStoredAudio = (
  row: typeof ttsProviderRuns.$inferSelect,
): TtsStoredAudio | null => {
  if (
    row.storageKey === null ||
    row.storageMimeType !== 'audio/wav' ||
    row.storageSizeBytes === null ||
    row.storageSha256 === null
  ) {
    return null;
  }
  return {
    storageKey: row.storageKey,
    mimeType: row.storageMimeType,
    sizeBytes: row.storageSizeBytes,
    sha256: row.storageSha256,
  };
};

const replayProviderRun = (
  row: typeof ttsProviderRuns.$inferSelect,
  currentLeaseToken: string,
): TtsProviderRunReplay => {
  if (row.status === 'SUCCEEDED') {
    const media = toStoredAudio(row);
    if (media === null || row.usage === null || row.estimatedCostUsd === null) {
      return {
        kind: 'OUTCOME_UNKNOWN',
        runId: row.id,
        cacheClaimToken: row.cacheClaimToken,
      };
    }
    return {
      kind: 'SUCCEEDED',
      runId: row.id,
      cacheClaimToken: row.cacheClaimToken,
      usage: row.usage,
      estimatedCostUsd: row.estimatedCostUsd,
      providerRequestId: row.providerRequestId,
      media,
    };
  }
  if (row.status === 'FAILED') {
    return {
      kind: 'FAILED',
      runId: row.id,
      cacheClaimToken: row.cacheClaimToken,
      errorCode: row.errorCode ?? 'TTS_PROVIDER_FAILED',
      retryable: row.retryable,
    };
  }
  if (row.status === 'OUTCOME_UNKNOWN') {
    return {
      kind: 'OUTCOME_UNKNOWN',
      runId: row.id,
      cacheClaimToken: row.cacheClaimToken,
    };
  }
  return row.itemLeaseToken === currentLeaseToken
    ? {
        kind: 'IN_PROGRESS',
        runId: row.id,
        cacheClaimToken: row.cacheClaimToken,
      }
    : {
        kind: 'OUTCOME_UNKNOWN',
        runId: row.id,
        cacheClaimToken: row.cacheClaimToken,
      };
};

const exactAudio = (
  row: typeof ttsAudioGcRecords.$inferSelect,
  media: TtsStoredAudio,
): boolean =>
  row.storageKey === media.storageKey &&
  row.mimeType === media.mimeType &&
  row.sizeBytes === media.sizeBytes &&
  row.sha256 === media.sha256;

/** provider run과 audio GC를 같은 PostgreSQL 소유권 규칙으로 구현한다 */
export class DrizzleTtsDurabilityRepository {
  constructor(
    private readonly database: TtsDurabilityDatabase,
    private readonly now: () => Date = () => new Date(),
    private readonly leaseId: () => string = randomUUID,
  ) {}

  /** 활성 item/cache claim에만 item attempt별 provider 호출 소유권을 발급한다 */
  async claimProviderRun(
    input: ClaimTtsProviderRunInput,
  ): Promise<ClaimTtsProviderRunResult> {
    return this.database.transaction(async (transaction) => {
      const [activeItem] = await transaction
        .select({ id: ttsItems.id })
        .from(ttsItems)
        .where(
          and(
            eq(ttsItems.id, input.item.itemId),
            eq(ttsItems.attempt, input.item.attempt),
            eq(ttsItems.status, 'PROCESSING'),
            eq(ttsItems.leaseToken, input.item.leaseToken),
            gt(ttsItems.leaseUntil, input.claimedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!activeItem) {
        return {
          kind: 'OUTCOME_UNKNOWN',
          cacheClaimToken: input.cacheClaimToken,
        };
      }

      const [activeCache] = await transaction
        .select({ id: ttsAudioCache.id })
        .from(ttsAudioCache)
        .where(
          and(
            eq(ttsAudioCache.cacheKey, input.cacheKey),
            eq(ttsAudioCache.status, 'GENERATING'),
            eq(ttsAudioCache.claimToken, input.cacheClaimToken),
          ),
        )
        .for('update')
        .limit(1);
      if (!activeCache) {
        return {
          kind: 'OUTCOME_UNKNOWN',
          cacheClaimToken: input.cacheClaimToken,
        };
      }

      const [existing] = await transaction
        .select()
        .from(ttsProviderRuns)
        .where(
          and(
            eq(ttsProviderRuns.itemId, input.item.itemId),
            eq(ttsProviderRuns.attempt, input.item.attempt),
          ),
        )
        .for('update')
        .limit(1);
      if (existing) {
        return replayProviderRun(existing, input.item.leaseToken);
      }

      const [inserted] = await transaction
        .insert(ttsProviderRuns)
        .values({
          itemId: input.item.itemId,
          attempt: input.item.attempt,
          cacheKey: input.cacheKey,
          cacheClaimToken: input.cacheClaimToken,
          itemLeaseToken: input.item.leaseToken,
          provider: input.provider,
          model: input.model,
          status: 'STARTED',
          startedAt: input.claimedAt,
          createdAt: input.claimedAt,
          updatedAt: input.claimedAt,
        })
        .onConflictDoNothing()
        .returning({ id: ttsProviderRuns.id });
      if (inserted) return { kind: 'CLAIMED', runId: inserted.id };

      const [concurrent] = await transaction
        .select()
        .from(ttsProviderRuns)
        .where(
          and(
            eq(ttsProviderRuns.itemId, input.item.itemId),
            eq(ttsProviderRuns.attempt, input.item.attempt),
          ),
        )
        .for('update')
        .limit(1);
      return concurrent
        ? replayProviderRun(concurrent, input.item.leaseToken)
        : {
            kind: 'OUTCOME_UNKNOWN',
            cacheClaimToken: input.cacheClaimToken,
          };
    });
  }

  /** 기존 item attempt의 terminal provider 결과를 새 호출 전에 확인한다 */
  async findProviderRun(
    item: Pick<TtsWorkItem, 'itemId' | 'attempt' | 'leaseToken'>,
  ): Promise<TtsProviderRunReplay | null> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(ttsProviderRuns)
        .where(
          and(
            eq(ttsProviderRuns.itemId, item.itemId),
            eq(ttsProviderRuns.attempt, item.attempt),
          ),
        )
        .for('update')
        .limit(1);
      if (!row) return null;
      if (row.status === 'STARTED' && row.itemLeaseToken !== item.leaseToken) {
        const finishedAt = this.now();
        const [closed] = await transaction
          .update(ttsProviderRuns)
          .set({
            status: 'OUTCOME_UNKNOWN',
            errorCode: 'TTS_PROVIDER_OUTCOME_UNKNOWN',
            retryable: false,
            finishedAt,
            updatedAt: finishedAt,
          })
          .where(
            and(
              eq(ttsProviderRuns.id, row.id),
              eq(ttsProviderRuns.status, 'STARTED'),
            ),
          )
          .returning();
        return replayProviderRun(closed ?? row, item.leaseToken);
      }
      return replayProviderRun(row, item.leaseToken);
    });
  }

  /** STARTED provider run 하나를 실제 object metadata가 있는 성공으로 닫는다 */
  async succeedProviderRun(input: {
    runId: string;
    usage: Record<string, number>;
    estimatedCostUsd: string;
    providerRequestId: string | null;
    media: TtsStoredAudio;
    finishedAt: Date;
  }): Promise<boolean> {
    assertStoredAudio(input.media);
    const usage = normalizeUsage(input.usage);
    if (!decimalPattern.test(input.estimatedCostUsd)) {
      throw new TtsDurabilityError('TTS_PROVIDER_COST_INVALID');
    }
    const rows = await this.database
      .update(ttsProviderRuns)
      .set({
        status: 'SUCCEEDED',
        usage,
        estimatedCostUsd: input.estimatedCostUsd,
        providerRequestId:
          input.providerRequestId !== null &&
          input.providerRequestId.length <= 512
            ? input.providerRequestId
            : null,
        errorCode: null,
        retryable: false,
        storageKey: input.media.storageKey,
        storageMimeType: input.media.mimeType,
        storageSizeBytes: input.media.sizeBytes,
        storageSha256: input.media.sha256,
        finishedAt: input.finishedAt,
        updatedAt: input.finishedAt,
      })
      .where(
        and(
          eq(ttsProviderRuns.id, input.runId),
          eq(ttsProviderRuns.status, 'STARTED'),
        ),
      )
      .returning({ id: ttsProviderRuns.id });
    return rows.length === 1;
  }

  /** STARTED provider run 하나를 known failure 또는 결과 불명으로 닫는다 */
  async failProviderRun(input: {
    runId: string;
    status: 'FAILED' | 'OUTCOME_UNKNOWN';
    errorCode: string;
    retryable: boolean;
    usage?: Record<string, number>;
    estimatedCostUsd?: string;
    providerRequestId?: string | null;
    finishedAt: Date;
  }): Promise<boolean> {
    const usage =
      input.usage === undefined ? null : normalizeUsage(input.usage);
    if (
      input.estimatedCostUsd !== undefined &&
      !decimalPattern.test(input.estimatedCostUsd)
    ) {
      throw new TtsDurabilityError('TTS_PROVIDER_COST_INVALID');
    }
    const rows = await this.database
      .update(ttsProviderRuns)
      .set({
        status: input.status,
        usage,
        estimatedCostUsd: input.estimatedCostUsd ?? null,
        providerRequestId:
          input.providerRequestId !== undefined &&
          input.providerRequestId !== null &&
          input.providerRequestId.length <= 512
            ? input.providerRequestId
            : null,
        errorCode:
          input.status === 'OUTCOME_UNKNOWN'
            ? 'TTS_PROVIDER_OUTCOME_UNKNOWN'
            : safeErrorCode(input.errorCode, 'TTS_PROVIDER_FAILED'),
        retryable: input.status === 'FAILED' && input.retryable,
        finishedAt: input.finishedAt,
        updatedAt: input.finishedAt,
      })
      .where(
        and(
          eq(ttsProviderRuns.id, input.runId),
          eq(ttsProviderRuns.status, 'STARTED'),
        ),
      )
      .returning({ id: ttsProviderRuns.id });
    return rows.length === 1;
  }

  /** object write 전에 세대 고유 storage key를 metadata exact GC intent로 등록한다 */
  async registerAudioGc(input: {
    media: TtsStoredAudio;
    registeredAt: Date;
  }): Promise<void> {
    assertStoredAudio(input.media);
    await this.database.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(ttsAudioGcRecords)
        .values({
          ...input.media,
          status: 'PENDING',
          availableAt: new Date(
            input.registeredAt.getTime() + ttsAudioGcWriteGraceMs,
          ),
          createdAt: input.registeredAt,
          updatedAt: input.registeredAt,
        })
        .onConflictDoNothing()
        .returning({ id: ttsAudioGcRecords.id });
      if (inserted) return;

      const [existing] = await transaction
        .select()
        .from(ttsAudioGcRecords)
        .where(eq(ttsAudioGcRecords.storageKey, input.media.storageKey))
        .for('update')
        .limit(1);
      if (!existing || !exactAudio(existing, input.media)) {
        throw new TtsDurabilityError('TTS_AUDIO_GC_METADATA_CONFLICT');
      }
      if (existing.status === 'PROCESSING' || existing.status === 'DELETED') {
        throw new TtsDurabilityError('TTS_AUDIO_GC_STORAGE_KEY_UNAVAILABLE');
      }
    });
  }

  /** READY commit이 GC delete보다 먼저 row를 잠갔을 때 참조 terminal로 전이한다 */
  async markAudioReferenced(
    transaction: TtsDurabilityTransaction,
    input: { media: TtsStoredAudio; referencedAt: Date },
  ): Promise<'REFERENCED' | 'DELETED'> {
    assertStoredAudio(input.media);
    const [record] = await transaction
      .select()
      .from(ttsAudioGcRecords)
      .where(eq(ttsAudioGcRecords.storageKey, input.media.storageKey))
      .for('update')
      .limit(1);
    if (!record || !exactAudio(record, input.media)) return 'DELETED';
    if (record.status === 'DELETED' || record.status === 'PROCESSING') {
      return 'DELETED';
    }
    if (record.status === 'REFERENCED') return 'REFERENCED';

    const [referenced] = await transaction
      .update(ttsAudioGcRecords)
      .set({
        status: 'REFERENCED',
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorAt: null,
        referencedAt: input.referencedAt,
        updatedAt: input.referencedAt,
      })
      .where(
        and(
          eq(ttsAudioGcRecords.id, record.id),
          eq(ttsAudioGcRecords.status, 'PENDING'),
        ),
      )
      .returning({ id: ttsAudioGcRecords.id });
    return referenced ? 'REFERENCED' : 'DELETED';
  }

  /** 참조 없는 가용 record만 SKIP LOCKED lease로 object 삭제 worker에게 준다 */
  async claimAudioGcBatch(input: {
    workerId: string;
    batchSize: number;
    leaseDurationMs: number;
  }): Promise<ClaimedTtsAudioGc[]> {
    const claimedAt = this.now();
    return this.database.transaction(async (transaction) => {
      const candidates = await transaction
        .select()
        .from(ttsAudioGcRecords)
        .where(
          and(
            or(
              eq(ttsAudioGcRecords.status, 'PENDING'),
              and(
                eq(ttsAudioGcRecords.status, 'PROCESSING'),
                lte(ttsAudioGcRecords.leaseExpiresAt, claimedAt),
              ),
            ),
            lte(ttsAudioGcRecords.availableAt, claimedAt),
          ),
        )
        .orderBy(ttsAudioGcRecords.availableAt, ttsAudioGcRecords.createdAt)
        .for('update', { skipLocked: true })
        .limit(input.batchSize);
      const claims: ClaimedTtsAudioGc[] = [];

      for (const candidate of candidates) {
        const [reference] = await transaction
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .leftJoin(
            ttsAudioCache,
            eq(ttsAudioCache.mediaAssetId, mediaAssets.id),
          )
          .leftJoin(ttsItems, eq(ttsItems.mediaAssetId, mediaAssets.id))
          .leftJoin(
            thaiSentenceVersions,
            eq(thaiSentenceVersions.mediaAssetId, mediaAssets.id),
          )
          .leftJoin(
            vocabularyPronunciations,
            eq(vocabularyPronunciations.mediaAssetId, mediaAssets.id),
          )
          .leftJoin(
            vocabularyPracticeQuestions,
            eq(vocabularyPracticeQuestions.mediaAssetId, mediaAssets.id),
          )
          .where(
            and(
              eq(mediaAssets.storageKey, candidate.storageKey),
              or(
                eq(mediaAssets.status, 'READY'),
                eq(ttsAudioCache.status, 'READY'),
                eq(ttsItems.status, 'SUCCEEDED'),
                eq(thaiSentenceVersions.mediaAssetId, mediaAssets.id),
                eq(vocabularyPronunciations.mediaAssetId, mediaAssets.id),
                eq(vocabularyPracticeQuestions.mediaAssetId, mediaAssets.id),
              ),
            ),
          )
          .for('update', { of: mediaAssets })
          .limit(1);
        if (reference) {
          await transaction
            .update(ttsAudioGcRecords)
            .set({
              status: 'REFERENCED',
              leaseOwner: null,
              leaseExpiresAt: null,
              lastErrorCode: null,
              lastErrorAt: null,
              referencedAt: claimedAt,
              updatedAt: claimedAt,
            })
            .where(eq(ttsAudioGcRecords.id, candidate.id))
            .returning({ id: ttsAudioGcRecords.id });
          continue;
        }

        const leaseOwner = `${input.workerId}:${this.leaseId()}`;
        const leaseExpiresAt = new Date(
          claimedAt.getTime() + input.leaseDurationMs,
        );
        const [claimed] = await transaction
          .update(ttsAudioGcRecords)
          .set({
            status: 'PROCESSING',
            leaseOwner,
            leaseExpiresAt,
            processingAttempts: candidate.processingAttempts + 1,
            lastErrorCode: null,
            lastErrorAt: null,
            updatedAt: claimedAt,
          })
          .where(
            and(
              eq(ttsAudioGcRecords.id, candidate.id),
              or(
                eq(ttsAudioGcRecords.status, 'PENDING'),
                and(
                  eq(ttsAudioGcRecords.status, 'PROCESSING'),
                  lte(ttsAudioGcRecords.leaseExpiresAt, claimedAt),
                ),
              ),
            ),
          )
          .returning();
        if (!claimed) continue;
        claims.push({
          id: claimed.id,
          leaseOwner,
          media: {
            storageKey: claimed.storageKey,
            mimeType: 'audio/wav',
            sizeBytes: claimed.sizeBytes,
            sha256: claimed.sha256,
          },
        });
      }
      return claims;
    });
  }

  /** active GC owner만 object 삭제 terminal을 기록한다 */
  async acknowledgeAudioDeleted(input: {
    id: string;
    leaseOwner: string;
    deletedAt: Date;
  }): Promise<boolean> {
    const rows = await this.database
      .update(ttsAudioGcRecords)
      .set({
        status: 'DELETED',
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorAt: null,
        deletedAt: input.deletedAt,
        updatedAt: input.deletedAt,
      })
      .where(
        and(
          eq(ttsAudioGcRecords.id, input.id),
          eq(ttsAudioGcRecords.status, 'PROCESSING'),
          eq(ttsAudioGcRecords.leaseOwner, input.leaseOwner),
          gt(ttsAudioGcRecords.leaseExpiresAt, input.deletedAt),
        ),
      )
      .returning({ id: ttsAudioGcRecords.id });
    return rows.length === 1;
  }

  /** 삭제 실패 record를 bounded code와 backoff 시각으로 다시 가용하게 한다 */
  async releaseAudioGc(input: {
    id: string;
    leaseOwner: string;
    failedAt: Date;
    nextAvailableAt: Date;
    errorCode: string;
  }): Promise<boolean> {
    const rows = await this.database
      .update(ttsAudioGcRecords)
      .set({
        status: 'PENDING',
        availableAt: input.nextAvailableAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: safeErrorCode(input.errorCode, 'TTS_AUDIO_GC_FAILED'),
        lastErrorAt: input.failedAt,
        updatedAt: input.failedAt,
      })
      .where(
        and(
          eq(ttsAudioGcRecords.id, input.id),
          eq(ttsAudioGcRecords.status, 'PROCESSING'),
          eq(ttsAudioGcRecords.leaseOwner, input.leaseOwner),
          gt(ttsAudioGcRecords.leaseExpiresAt, input.failedAt),
        ),
      )
      .returning({ id: ttsAudioGcRecords.id });
    return rows.length === 1;
  }
}
