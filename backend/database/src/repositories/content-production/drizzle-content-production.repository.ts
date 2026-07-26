/** 콘텐츠 제작 작업·항목 조건부 전이와 preset 조회를 Drizzle로 구현한다 */
import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from 'drizzle-orm';
import {
  CONTENT_PRODUCTION_ITEM_LEASE_MS,
  ContentProductionDomainError,
} from '@flex-thia/domain';
import type {
  ContentProductionItem,
  ContentProductionItemSeed,
  ContentProductionJob,
  ContentProductionJobStatus,
  ContentProductionPresetCatalog,
  ContentProductionPresetSnapshot,
  ContentProductionRepository,
  CreateContentProductionCommand,
} from '@flex-thia/domain';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  contentProductionPresets,
  jobInputs,
  jobItems,
  jobs,
  uploads,
} from '../../schema/index.js';
import * as schema from '../../schema/index.js';

type ContentProductionDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type ContentProductionExecutor = Pick<ContentProductionDatabase, 'select'>;
type JobRow = typeof jobs.$inferSelect;

const toItem = (row: typeof jobItems.$inferSelect): ContentProductionItem => {
  if (!row.sourceRef) {
    throw new Error(`sourceRef가 없는 콘텐츠 제작 항목입니다: ${row.id}`);
  }

  return {
    id: row.id,
    sourceRef: row.sourceRef,
    status: row.status,
    attempt: row.attempt,
    retryable: row.retryable,
    errorCode: row.errorCode,
    leaseUntil: row.leaseUntil,
    leaseToken: row.leaseToken,
  };
};

const calculateCounts = (items: ContentProductionItem[]) => ({
  total: items.length,
  succeeded: items.filter((item) => item.status === 'SUCCEEDED').length,
  needsAttention: items.filter((item) => item.status === 'NEEDS_ATTENTION')
    .length,
  failed: items.filter((item) => item.status === 'FAILED').length,
});

const toContentProductionStatus = (
  status: JobRow['status'],
): ContentProductionJobStatus => {
  if (status === 'CANCELLED') {
    throw new Error('취소된 legacy Job은 콘텐츠 제작 작업이 아닙니다');
  }

  return status;
};

const loadJob = async (
  executor: ContentProductionExecutor,
  row: JobRow,
): Promise<ContentProductionJob> => {
  if (!row.purpose || !row.presetSnapshot) {
    throw new Error(`콘텐츠 제작 snapshot이 없는 Job입니다: ${row.id}`);
  }

  const inputRows = await executor
    .select({
      jobInputId: jobInputs.id,
      ordinal: jobInputs.ordinal,
      uploadId: uploads.id,
      inputType: uploads.inputType,
      inputKey: uploads.objectKey,
      sizeBytes: uploads.sizeBytes,
    })
    .from(jobInputs)
    .innerJoin(uploads, eq(jobInputs.uploadId, uploads.id))
    .where(eq(jobInputs.jobId, row.id))
    .orderBy(asc(jobInputs.ordinal));
  const inputs = inputRows.map((input) => {
    if (input.sizeBytes === null) {
      throw new Error(`검증되지 않은 upload입니다: ${input.uploadId}`);
    }

    return { ...input, sizeBytes: input.sizeBytes };
  });
  const items = (
    await executor
      .select()
      .from(jobItems)
      .where(eq(jobItems.jobId, row.id))
      .orderBy(asc(jobItems.createdAt), asc(jobItems.id))
  ).map(toItem);

  return {
    id: row.id,
    requestedBy: row.requestedBy,
    clientRequestId: row.clientRequestId,
    purpose: row.purpose,
    presetSnapshot: row.presetSnapshot,
    inputs,
    status: toContentProductionStatus(row.status),
    attempt: row.attempt,
    enqueuedAt: row.enqueuedAt,
    completedAt: row.completedAt,
    failureCode: row.failureCode,
    counts: calculateCounts(items),
    items,
    createdAt: row.createdAt,
  };
};

const finalStatus = (
  counts: ReturnType<typeof calculateCounts>,
): ContentProductionJobStatus => {
  if (counts.failed === counts.total && counts.total > 0) {
    return 'FAILED';
  }

  if (counts.failed > 0 || counts.needsAttention > 0) {
    return 'COMPLETED_WITH_FAILURES';
  }

  return 'COMPLETED';
};

/** PostgreSQL 조건부 update로 stale worker와 terminal 재전달을 차단한다 */
export class DrizzleContentProductionRepository implements ContentProductionRepository {
  constructor(
    private readonly database: ContentProductionDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** unique 요청 충돌은 기존 snapshot을 읽고 새 입력만 transaction에 저장한다 */
  async createOrFind(
    command: CreateContentProductionCommand,
  ): Promise<{ job: ContentProductionJob; created: boolean }> {
    return this.database.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(jobs)
        .values({
          requestedBy: command.requestedBy,
          clientRequestId: command.clientRequestId,
          type: command.purpose,
          purpose: command.purpose,
          presetId: command.presetSnapshot.id,
          presetSnapshot: command.presetSnapshot,
        })
        .onConflictDoNothing({
          target: [jobs.requestedBy, jobs.clientRequestId],
        })
        .returning({ id: jobs.id });
      const [row] = await transaction
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.requestedBy, command.requestedBy),
            eq(jobs.clientRequestId, command.clientRequestId),
          ),
        )
        .limit(1);

      if (!row) {
        throw new Error('콘텐츠 제작 Job insert 또는 조회 결과가 없습니다');
      }

      const created = inserted.length > 0;

      if (!created && (!row.purpose || !row.presetSnapshot)) {
        throw new ContentProductionDomainError(
          'CONTENT_PRODUCTION_IDEMPOTENCY_CONFLICT',
        );
      }

      if (created) {
        await transaction.insert(jobInputs).values(
          command.inputs.map((input, ordinal) => ({
            jobId: row.id,
            uploadId: input.uploadId,
            ordinal,
          })),
        );
      }

      return {
        job: await loadJob(transaction, row),
        created,
      };
    });
  }

  /** 현재 attempt의 첫 queue 전송만 시각을 기록한다 */
  async markEnqueued(
    jobId: string,
    attempt: number,
    enqueuedAt: Date,
  ): Promise<ContentProductionJob> {
    await this.database
      .update(jobs)
      .set({ enqueuedAt, updatedAt: enqueuedAt })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.attempt, attempt),
          isNull(jobs.enqueuedAt),
        ),
      );
    const job = await this.findById(jobId);

    if (!job) {
      throw new Error(`콘텐츠 제작 Job을 찾을 수 없습니다: ${jobId}`);
    }

    return job;
  }

  /** 요청 관리자에게 속한 콘텐츠 제작 작업만 반환한다 */
  async findOwnedById(
    ownerId: string,
    jobId: string,
  ): Promise<ContentProductionJob | null> {
    const [row] = await this.database
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.requestedBy, ownerId),
          isNotNull(jobs.purpose),
        ),
      )
      .limit(1);
    return row ? loadJob(this.database, row) : null;
  }

  /** 요청 관리자의 최신 콘텐츠 제작 작업을 제한 개수만 반환한다 */
  async listOwned(
    ownerId: string,
    limit: number,
  ): Promise<ContentProductionJob[]> {
    const rows = await this.database
      .select()
      .from(jobs)
      .where(and(eq(jobs.requestedBy, ownerId), isNotNull(jobs.purpose)))
      .orderBy(desc(jobs.createdAt), desc(jobs.id))
      .limit(limit);
    return Promise.all(rows.map((row) => loadJob(this.database, row)));
  }

  /** 정확한 QUEUED attempt만 RUNNING으로 claim한다 */
  async startAttempt(
    jobId: string,
    attempt: number,
  ): Promise<ContentProductionJob | null> {
    await this.database
      .update(jobs)
      .set({ status: 'RUNNING', updatedAt: this.now() })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.attempt, attempt),
          eq(jobs.status, 'QUEUED'),
        ),
      );

    const job = await this.findById(jobId);

    if (!job || job.attempt !== attempt || job.status !== 'RUNNING') {
      return null;
    }

    return job;
  }

  /** 같은 sourceRef 항목은 중복 전달에도 한 번만 생성한다 */
  async ensureItems(
    jobId: string,
    inputs: string[] | ContentProductionItemSeed[],
  ): Promise<void> {
    if (inputs.length === 0) {
      return;
    }
    const sourceRefs = inputs.map((input) =>
      typeof input === 'string' ? input : input.sourceRef,
    );

    const job = await this.findById(jobId);

    if (!job) {
      throw new Error(`콘텐츠 제작 Job을 찾을 수 없습니다: ${jobId}`);
    }

    await this.database
      .insert(jobItems)
      .values(
        sourceRefs.map((sourceRef) => ({
          jobId,
          sourceRef,
          attempt: job.attempt,
        })),
      )
      .onConflictDoNothing({
        target: [jobItems.jobId, jobItems.sourceRef],
      });
  }

  /** 현재 attempt의 PENDING 또는 lease 만료 PROCESSING 항목만 반환한다 */
  async listAttemptItems(
    jobId: string,
    attempt: number,
  ): Promise<ContentProductionItem[]> {
    const now = this.now();
    return (
      await this.database
        .select()
        .from(jobItems)
        .where(
          and(
            eq(jobItems.jobId, jobId),
            eq(jobItems.attempt, attempt),
            or(
              eq(jobItems.status, 'PENDING'),
              and(
                eq(jobItems.status, 'PROCESSING'),
                or(isNull(jobItems.leaseUntil), lte(jobItems.leaseUntil, now)),
              ),
            ),
          ),
        )
        .orderBy(asc(jobItems.createdAt), asc(jobItems.id))
    ).map(toItem);
  }

  /** PENDING 또는 lease 만료 PROCESSING 항목만 새 lease로 claim한다 */
  async startItem(
    jobId: string,
    itemId: string,
    attempt: number,
  ): Promise<ContentProductionItem | null> {
    const claimedAt = this.now();
    const leaseUntil = new Date(
      claimedAt.getTime() + CONTENT_PRODUCTION_ITEM_LEASE_MS,
    );
    const leaseToken = randomUUID();
    const [row] = await this.database
      .update(jobItems)
      .set({
        status: 'PROCESSING',
        leaseUntil,
        leaseToken,
        updatedAt: claimedAt,
      })
      .where(
        and(
          eq(jobItems.jobId, jobId),
          eq(jobItems.id, itemId),
          eq(jobItems.attempt, attempt),
          or(
            eq(jobItems.status, 'PENDING'),
            and(
              eq(jobItems.status, 'PROCESSING'),
              or(
                isNull(jobItems.leaseUntil),
                lte(jobItems.leaseUntil, claimedAt),
              ),
            ),
          ),
        ),
      )
      .returning();
    return row ? toItem(row) : null;
  }

  /** 활성 token 소유자만 lease를 연장한다 */
  async renewItemLease(
    jobId: string,
    itemId: string,
    attempt: number,
    leaseToken: string,
  ): Promise<boolean> {
    const renewedAt = this.now();
    const leaseUntil = new Date(
      renewedAt.getTime() + CONTENT_PRODUCTION_ITEM_LEASE_MS,
    );
    const renewed = await this.database
      .update(jobItems)
      .set({ leaseUntil, updatedAt: renewedAt })
      .where(
        and(
          eq(jobItems.jobId, jobId),
          eq(jobItems.id, itemId),
          eq(jobItems.attempt, attempt),
          eq(jobItems.status, 'PROCESSING'),
          eq(jobItems.leaseToken, leaseToken),
          gt(jobItems.leaseUntil, renewedAt),
        ),
      )
      .returning({ id: jobItems.id });
    return renewed.length > 0;
  }

  /** 현재 lease 소유자의 완료 결과만 terminal 상태로 반영한다 */
  async finishItem(
    jobId: string,
    itemId: string,
    attempt: number,
    leaseToken: string,
    outcome: {
      status: 'SUCCEEDED' | 'NEEDS_ATTENTION' | 'FAILED';
      retryable: boolean;
      errorCode: string | null;
      result?: Record<string, unknown>;
    },
  ): Promise<boolean> {
    const updated = await this.database
      .update(jobItems)
      .set({
        ...outcome,
        leaseUntil: null,
        leaseToken: null,
        updatedAt: this.now(),
      })
      .where(
        and(
          eq(jobItems.jobId, jobId),
          eq(jobItems.id, itemId),
          eq(jobItems.attempt, attempt),
          eq(jobItems.status, 'PROCESSING'),
          eq(jobItems.leaseToken, leaseToken),
        ),
      )
      .returning({ id: jobItems.id });
    return updated.length > 0;
  }

  /** 모든 현재 항목이 끝난 RUNNING attempt만 최종 상태로 집계한다 */
  async finalizeAttempt(
    jobId: string,
    attempt: number,
  ): Promise<{ jobId: string; status: ContentProductionJobStatus } | null> {
    return this.database.transaction(async (transaction) => {
      const rows = await transaction
        .select()
        .from(jobItems)
        .where(eq(jobItems.jobId, jobId));
      const items = rows.map(toItem);

      if (
        items.some(
          (item) =>
            item.attempt === attempt &&
            (item.status === 'PENDING' || item.status === 'PROCESSING'),
        )
      ) {
        return null;
      }

      const status = finalStatus(calculateCounts(items));
      const updated = await transaction
        .update(jobs)
        .set({
          status,
          completedAt: this.now(),
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.attempt, attempt),
            eq(jobs.status, 'RUNNING'),
          ),
        )
        .returning({ id: jobs.id });
      return updated.length > 0 ? { jobId, status } : null;
    });
  }

  /** 현재 QUEUED 또는 RUNNING attempt만 unfinished 항목과 함께 실패시킨다 */
  async failAttempt(
    jobId: string,
    attempt: number,
    errorCode: string,
  ): Promise<{ jobId: string; status: 'FAILED' } | null> {
    return this.database.transaction(async (transaction) => {
      const failedAt = this.now();
      const failed = await transaction
        .update(jobs)
        .set({
          status: 'FAILED',
          failureCode: errorCode,
          completedAt: failedAt,
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.attempt, attempt),
            inArray(jobs.status, ['QUEUED', 'RUNNING']),
          ),
        )
        .returning({ id: jobs.id });

      if (failed.length === 0) {
        return null;
      }

      await transaction
        .update(jobItems)
        .set({
          status: 'FAILED',
          retryable: true,
          errorCode,
          leaseUntil: null,
          leaseToken: null,
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(jobItems.jobId, jobId),
            eq(jobItems.attempt, attempt),
            inArray(jobItems.status, ['PENDING', 'PROCESSING']),
          ),
        );
      return { jobId, status: 'FAILED' };
    });
  }

  /** retryable 실패만 다음 attempt로 열고 성공·검토 결과는 보존한다 */
  async retryFailed(
    jobId: string,
    ownerId: string,
    maxAttempts: number,
  ): Promise<ContentProductionJob | null> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.requestedBy, ownerId),
            inArray(jobs.status, ['FAILED', 'COMPLETED_WITH_FAILURES']),
          ),
        )
        .limit(1);

      if (!row || row.attempt >= maxAttempts) {
        return null;
      }

      const retryableRows = await transaction
        .select({ id: jobItems.id })
        .from(jobItems)
        .where(
          and(
            eq(jobItems.jobId, jobId),
            eq(jobItems.status, 'FAILED'),
            eq(jobItems.retryable, true),
          ),
        );

      const hasWorkflowFailure =
        row.status === 'FAILED' &&
        row.failureCode === 'CONTENT_PRODUCTION_WORKFLOW_FAILURE';

      if (retryableRows.length === 0 && !hasWorkflowFailure) {
        return null;
      }

      const nextAttempt = row.attempt + 1;
      const retryableJobCondition =
        retryableRows.length === 0
          ? and(
              eq(jobs.status, 'FAILED'),
              eq(jobs.failureCode, 'CONTENT_PRODUCTION_WORKFLOW_FAILURE'),
            )
          : inArray(jobs.status, ['FAILED', 'COMPLETED_WITH_FAILURES']);
      const updated = await transaction
        .update(jobs)
        .set({
          attempt: nextAttempt,
          status: 'QUEUED',
          enqueuedAt: null,
          completedAt: null,
          failureCode: null,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.attempt, row.attempt),
            retryableJobCondition,
          ),
        )
        .returning();

      if (updated.length === 0) {
        return null;
      }

      await transaction
        .update(jobItems)
        .set({
          status: 'PENDING',
          attempt: nextAttempt,
          retryable: false,
          errorCode: null,
          leaseUntil: null,
          leaseToken: null,
          result: null,
          updatedAt: this.now(),
        })
        .where(
          inArray(
            jobItems.id,
            retryableRows.map((item) => item.id),
          ),
        );
      return loadJob(transaction, updated[0]!);
    });
  }

  private async findById(jobId: string): Promise<ContentProductionJob | null> {
    const [row] = await this.database
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), isNotNull(jobs.purpose)))
      .limit(1);
    return row ? loadJob(this.database, row) : null;
  }
}

/** 활성 콘텐츠 제작 preset을 DB에서 조회한다 */
export class DrizzleContentProductionPresetCatalog implements ContentProductionPresetCatalog {
  constructor(private readonly database: ContentProductionDatabase) {}

  /** 관리자에게 활성 preset만 목적·이름 순으로 반환한다 */
  async listEnabled(): Promise<ContentProductionPresetSnapshot[]> {
    return this.database
      .select({
        id: contentProductionPresets.id,
        name: contentProductionPresets.name,
        purpose: contentProductionPresets.purpose,
        version: contentProductionPresets.version,
        parameters: contentProductionPresets.parameters,
      })
      .from(contentProductionPresets)
      .where(eq(contentProductionPresets.enabled, true))
      .orderBy(
        asc(contentProductionPresets.purpose),
        asc(contentProductionPresets.name),
      );
  }

  /** 작업 생성 시 선택한 활성 preset snapshot을 반환한다 */
  async findEnabledById(
    presetId: string,
  ): Promise<ContentProductionPresetSnapshot | null> {
    const [preset] = await this.database
      .select({
        id: contentProductionPresets.id,
        name: contentProductionPresets.name,
        purpose: contentProductionPresets.purpose,
        version: contentProductionPresets.version,
        parameters: contentProductionPresets.parameters,
      })
      .from(contentProductionPresets)
      .where(
        and(
          eq(contentProductionPresets.id, presetId),
          eq(contentProductionPresets.enabled, true),
        ),
      )
      .limit(1);
    return preset ?? null;
  }
}
