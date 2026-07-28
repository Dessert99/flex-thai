/** TTS 재시도 상태 전이와 durable dispatch를 한 transaction으로 조정한다 */
import {
  aggregateTtsJobStatus,
  retryTtsItems,
  type AuditedRetryTtsItemsInput,
  type RetryTtsItemsInput,
  TtsDomainError,
} from '@flex-thia/domain';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as schema from '../../schema/index.js';
import { auditLogs } from '../../schema/identity.schema.js';
import { ttsAudioCache, ttsItems, ttsJobs } from '../../schema/tts.schema.js';
import {
  createTtsRetryCommandFingerprint,
  type TtsDispatchOutboxWriter,
} from '../dispatch/drizzle-async-dispatch-outbox.repository.js';

type TtsRetryDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type TtsRetryTransaction = Parameters<
  Parameters<TtsRetryDatabase['transaction']>[0]
>[0];
type TtsRetryItemRow = typeof ttsItems.$inferSelect;

const toItem = (row: TtsRetryItemRow) => ({
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

const assertCommand = (
  input: RetryTtsItemsInput,
): { itemIds: string[]; expectedAttempts: Record<string, number> } => {
  if (input.itemIds.length === 0) {
    throw new TtsDomainError('TTS_RETRY_ITEMS_REQUIRED');
  }
  const itemIds = [...new Set(input.itemIds)].sort();
  const expectedKeys = Object.keys(input.expectedAttempts).sort();
  if (
    itemIds.length !== input.itemIds.length ||
    expectedKeys.length !== itemIds.length ||
    expectedKeys.some((key, index) => key !== itemIds[index])
  ) {
    throw new TtsDomainError('TTS_RETRY_SELECTION_INVALID');
  }
  if (
    itemIds.some((itemId) => {
      const expectedAttempt = input.expectedAttempts[itemId];
      return (
        expectedAttempt === undefined ||
        !Number.isSafeInteger(expectedAttempt) ||
        expectedAttempt < 0
      );
    })
  ) {
    throw new TtsDomainError('TTS_RETRY_ATTEMPT_MISMATCH');
  }
  return {
    itemIds,
    expectedAttempts: Object.fromEntries(
      itemIds.map((itemId) => [itemId, input.expectedAttempts[itemId]!]),
    ),
  };
};

const isExactReplay = (
  rows: TtsRetryItemRow[],
  expectedAttempts: Readonly<Record<string, number>>,
): boolean =>
  rows.every((row) => row.attempt === expectedAttempts[row.id]! + 1);

/** 선택 retryable item과 cache/job/outbox를 낙관적 attempt 기준으로 원자화한다 */
export class DrizzleTtsRetryCoordinator {
  constructor(
    private readonly database: TtsRetryDatabase,
    private readonly dispatchWriter: TtsDispatchOutboxWriter<TtsRetryTransaction>,
  ) {}

  /** retry selection을 순서와 무관한 durable command fingerprint로 만든다 */
  static commandFingerprint(input: RetryTtsItemsInput): string {
    const command = assertCommand(input);
    return createTtsRetryCommandFingerprint(
      input.jobId,
      command.expectedAttempts,
    );
  }

  /** 성공 반환은 상태 전이와 동일 attempt outbox가 함께 commit될 때만 허용한다 */
  async retryAndDispatch(input: AuditedRetryTtsItemsInput): Promise<number> {
    const command = assertCommand(input);
    const commandFingerprint = createTtsRetryCommandFingerprint(
      input.jobId,
      command.expectedAttempts,
    );
    return this.database.transaction(async (transaction) => {
      const rows = await transaction
        .select()
        .from(ttsItems)
        .where(inArray(ttsItems.id, command.itemIds))
        .orderBy(asc(ttsItems.id))
        .for('update');
      if (
        rows.length !== command.itemIds.length ||
        rows.some((row) => row.jobId !== input.jobId)
      ) {
        throw new TtsDomainError('TTS_ITEM_NOT_FOUND');
      }

      const [job] = await transaction
        .select({
          id: ttsJobs.id,
          dispatchAttempt: ttsJobs.dispatchAttempt,
          lastDispatchCommandFingerprint:
            ttsJobs.lastDispatchCommandFingerprint,
        })
        .from(ttsJobs)
        .where(eq(ttsJobs.id, input.jobId))
        .for('update')
        .limit(1);
      if (!job) throw new TtsDomainError('TTS_ITEM_NOT_FOUND');

      if (isExactReplay(rows, command.expectedAttempts)) {
        if (job.lastDispatchCommandFingerprint !== commandFingerprint) {
          throw new TtsDomainError('TTS_ITEM_STALE_ATTEMPT');
        }
        await this.dispatchWriter.assertTtsDispatch(transaction, {
          jobId: input.jobId,
          attempt: job.dispatchAttempt,
          commandFingerprint,
        });
        const [audit] = await transaction
          .select({
            requestId: auditLogs.requestId,
            summary: auditLogs.summary,
          })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.action, 'TTS_ITEMS_RETRIED'),
              eq(auditLogs.targetType, 'TTS_JOB'),
              eq(auditLogs.targetId, input.jobId),
              eq(auditLogs.requestId, input.context.requestId),
            ),
          )
          .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
          .limit(1);
        const auditSummary = audit?.summary as
          { commandFingerprint?: unknown } | undefined;
        if (
          audit?.requestId !== input.context.requestId ||
          auditSummary?.commandFingerprint !== commandFingerprint
        ) {
          throw new TtsDomainError('TTS_ITEM_STALE_ATTEMPT');
        }
        return command.itemIds.length;
      }
      const dispatchAttempt = job.dispatchAttempt + 1;
      if (!Number.isSafeInteger(dispatchAttempt) || dispatchAttempt < 1) {
        throw new TtsDomainError('TTS_RETRY_ATTEMPT_MISMATCH');
      }

      const retried = retryTtsItems(rows.map(toItem), input);
      const retriedById = new Map(retried.map((item) => [item.id, item]));
      for (const itemId of command.itemIds) {
        const item = retriedById.get(itemId);
        const expectedAttempt = command.expectedAttempts[itemId];
        if (!item) throw new TtsDomainError('TTS_ITEM_NOT_FOUND');
        if (expectedAttempt === undefined) {
          throw new TtsDomainError('TTS_RETRY_SELECTION_INVALID');
        }
        const updated = await transaction
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
              eq(ttsItems.jobId, input.jobId),
              eq(ttsItems.status, 'FAILED'),
              eq(ttsItems.attempt, expectedAttempt),
              eq(ttsItems.retryable, true),
            ),
          )
          .returning({ id: ttsItems.id });
        if (updated.length !== 1) {
          throw new TtsDomainError('TTS_ITEM_STALE_ATTEMPT');
        }
      }

      const cacheKeys = [...new Set(rows.map((row) => row.cacheKey))];
      await transaction
        .update(ttsAudioCache)
        .set({
          status: 'PENDING',
          claimToken: null,
          claimedAt: null,
          errorCode: null,
          retryable: false,
          updatedAt: input.requestedAt,
        })
        .where(
          and(
            inArray(ttsAudioCache.cacheKey, cacheKeys),
            eq(ttsAudioCache.status, 'FAILED'),
            eq(ttsAudioCache.retryable, true),
          ),
        )
        .returning({ id: ttsAudioCache.id });

      const currentRows = await transaction
        .select()
        .from(ttsItems)
        .where(eq(ttsItems.jobId, input.jobId))
        .orderBy(asc(ttsItems.id));
      const summary = aggregateTtsJobStatus(currentRows.map(toItem));
      const updatedJob = await transaction
        .update(ttsJobs)
        .set({
          status: summary.status,
          pendingCount: summary.counts.pending,
          processingCount: summary.counts.processing,
          succeededCount: summary.counts.succeeded,
          failedCount: summary.counts.failed,
          dispatchAttempt,
          lastDispatchCommandFingerprint: commandFingerprint,
          finishedAt: null,
          updatedAt: input.requestedAt,
        })
        .where(
          and(
            eq(ttsJobs.id, input.jobId),
            eq(ttsJobs.dispatchAttempt, job.dispatchAttempt),
          ),
        )
        .returning({ id: ttsJobs.id });
      if (updatedJob.length !== 1) {
        throw new TtsDomainError('TTS_ITEM_NOT_FOUND');
      }

      await transaction.insert(auditLogs).values({
        actorSub: input.context.actorSub,
        actorUserId: input.context.actorUserId,
        action: 'TTS_ITEMS_RETRIED',
        target: input.jobId,
        targetType: 'TTS_JOB',
        targetId: input.jobId,
        requestId: input.context.requestId,
        summary: {
          itemIds: command.itemIds,
          expectedAttempts: command.itemIds.map(
            (itemId) => command.expectedAttempts[itemId]!,
          ),
          dispatchAttempt,
          commandFingerprint,
        },
        createdAt: input.requestedAt,
      });
      await this.dispatchWriter.enqueueTts(transaction, {
        jobId: input.jobId,
        attempt: dispatchAttempt,
        commandFingerprint,
        requestedAt: input.requestedAt,
      });
      return command.itemIds.length;
    });
  }
}
