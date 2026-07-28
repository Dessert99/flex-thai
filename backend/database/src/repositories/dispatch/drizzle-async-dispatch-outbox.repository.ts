/** 공유 dispatch outbox의 exact insert와 lease 기반 claim·ack·release를 구현한다 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  QuestionRegenerationDispatchInput,
  QuestionRegenerationDispatchWriter,
} from '@flex-thia/domain';
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  asyncDispatchOutbox,
  type asyncDispatchPayloadKindEnum,
} from '../../schema/async-dispatch-outbox.schema.js';
import { jobs } from '../../schema/jobs.schema.js';
import * as schema from '../../schema/index.js';

type AsyncDispatchPayloadKind =
  (typeof asyncDispatchPayloadKindEnum.enumValues)[number];
type AsyncDispatchDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
/** 공용 writer가 호출자의 commit 경계를 그대로 사용하게 하는 Drizzle session */
export type AsyncDispatchTransaction = Parameters<
  Parameters<AsyncDispatchDatabase['transaction']>[0]
>[0];

/** outbox에 저장하는 queue별 최소 실행 payload */
export type AsyncDispatchPayload =
  | {
      payloadKind: 'CONTENT_PRODUCTION';
      jobId: string;
      attempt: number;
      payload: { jobId: string; attempt: number };
    }
  | {
      payloadKind: 'TTS';
      jobId: string;
      attempt: number;
      payload: {
        jobId: string;
        attempt: number;
        commandFingerprint: string;
      };
    };

/** relay가 소유권과 결정적 delivery identity를 함께 받는 claim 결과 */
export interface ClaimedAsyncDispatchOutboxRow {
  id: string;
  payloadKind: AsyncDispatchPayloadKind;
  jobId: string;
  attempt: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  leaseOwner: string;
  leaseExpiresAt: Date;
  deliveryAttempts: number;
}

/** 호출 transaction 안에 TTS 실행 intent를 exact-once로 기록하는 writer */
export interface TtsDispatchOutboxWriter<
  Transaction = AsyncDispatchTransaction,
> {
  enqueueTts(
    transaction: Transaction,
    input: {
      jobId: string;
      attempt: number;
      commandFingerprint: string;
      requestedAt: Date;
    },
  ): Promise<void>;
  assertTtsDispatch(
    transaction: Transaction,
    input: { jobId: string; attempt: number; commandFingerprint: string },
  ): Promise<void>;
}

const sha256 = (canonicalCommand: string): string =>
  createHash('sha256').update(canonicalCommand).digest('hex');

/** 최초 TTS dispatch를 retry 선택과 겹치지 않는 command identity로 만든다 */
export const createTtsInitialCommandFingerprint = (jobId: string): string =>
  sha256(`tts-initial:${jobId}`);

/** item별 기대 attempt를 정렬해 순서와 무관한 retry command identity로 만든다 */
export const createTtsRetryCommandFingerprint = (
  jobId: string,
  expectedAttempts: Readonly<Record<string, number>>,
): string =>
  sha256(
    `tts-retry:${jobId}:${Object.entries(expectedAttempts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemId, expectedAttempt]) => `${itemId}:${expectedAttempt}`)
      .join(',')}`,
  );

/** outbox 저장 불변식 위반을 stable 내부 code로 전달한다 */
export class AsyncDispatchOutboxError extends Error {
  constructor(
    readonly code:
      | 'ASYNC_DISPATCH_OUTBOX_IDEMPOTENCY_CONFLICT'
      | 'ASYNC_DISPATCH_OUTBOX_INVALID_CLAIM'
      | 'ASYNC_DISPATCH_OUTBOX_PERSISTENCE_CONFLICT',
  ) {
    super(code);
    this.name = 'AsyncDispatchOutboxError';
  }
}

const storedSelection = {
  id: asyncDispatchOutbox.id,
  payloadKind: asyncDispatchOutbox.payloadKind,
  jobId: asyncDispatchOutbox.jobId,
  attempt: asyncDispatchOutbox.attempt,
  idempotencyKey: asyncDispatchOutbox.idempotencyKey,
  payload: asyncDispatchOutbox.payload,
  availableAt: asyncDispatchOutbox.availableAt,
  leaseOwner: asyncDispatchOutbox.leaseOwner,
  leaseExpiresAt: asyncDispatchOutbox.leaseExpiresAt,
  deliveryAttempts: asyncDispatchOutbox.deliveryAttempts,
  deliveredAt: asyncDispatchOutbox.deliveredAt,
  lastErrorCode: asyncDispatchOutbox.lastErrorCode,
  lastErrorAt: asyncDispatchOutbox.lastErrorAt,
  createdAt: asyncDispatchOutbox.createdAt,
  updatedAt: asyncDispatchOutbox.updatedAt,
};

const claimedSelection = {
  id: asyncDispatchOutbox.id,
  payloadKind: asyncDispatchOutbox.payloadKind,
  jobId: asyncDispatchOutbox.jobId,
  attempt: asyncDispatchOutbox.attempt,
  idempotencyKey: asyncDispatchOutbox.idempotencyKey,
  payload: asyncDispatchOutbox.payload,
  leaseOwner: asyncDispatchOutbox.leaseOwner,
  leaseExpiresAt: asyncDispatchOutbox.leaseExpiresAt,
  deliveryAttempts: asyncDispatchOutbox.deliveryAttempts,
};

const idempotencyKeyFor = (
  payloadKind: AsyncDispatchPayloadKind,
  jobId: string,
  attempt: number,
): string =>
  `${payloadKind === 'CONTENT_PRODUCTION' ? 'content-production' : 'tts'}:${jobId}:${attempt}`;

const normalizeWorkerId = (workerId: string): string => {
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(workerId)) {
    throw new AsyncDispatchOutboxError('ASYNC_DISPATCH_OUTBOX_INVALID_CLAIM');
  }
  return workerId;
};

const normalizeErrorCode = (errorCode: string): string =>
  /^[A-Z][A-Z0-9_]{0,95}$/.test(errorCode)
    ? errorCode
    : 'ASYNC_DISPATCH_FAILED';

const assertExactReplay = (
  row: {
    payloadKind: AsyncDispatchPayloadKind;
    jobId: string;
    attempt: number;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
  expected: AsyncDispatchPayload & { idempotencyKey: string },
): void => {
  if (
    row.payloadKind !== expected.payloadKind ||
    row.jobId !== expected.jobId ||
    row.attempt !== expected.attempt ||
    row.idempotencyKey !== expected.idempotencyKey ||
    !isDeepStrictEqual(row.payload, expected.payload)
  ) {
    throw new AsyncDispatchOutboxError(
      'ASYNC_DISPATCH_OUTBOX_IDEMPOTENCY_CONFLICT',
    );
  }
};

const mapClaimed = (
  row: Omit<ClaimedAsyncDispatchOutboxRow, 'leaseOwner' | 'leaseExpiresAt'> & {
    leaseOwner: string | null;
    leaseExpiresAt: Date | null;
  },
): ClaimedAsyncDispatchOutboxRow => {
  if (row.leaseOwner === null || row.leaseExpiresAt === null) {
    throw new AsyncDispatchOutboxError(
      'ASYNC_DISPATCH_OUTBOX_PERSISTENCE_CONFLICT',
    );
  }
  return {
    ...row,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
  };
};

/** 공용 outbox writer와 lease repository를 한 PostgreSQL adapter로 제공한다 */
export class DrizzleAsyncDispatchOutboxRepository
  implements
    QuestionRegenerationDispatchWriter<AsyncDispatchTransaction>,
    TtsDispatchOutboxWriter<AsyncDispatchTransaction>
{
  constructor(
    private readonly database: AsyncDispatchDatabase,
    private readonly now: () => Date = () => new Date(),
    private readonly createLeaseId: () => string = () => crypto.randomUUID(),
  ) {}

  /** AI 재생성 실행을 호출 transaction 안에 exact-once intent로 기록한다 */
  async enqueue(
    transaction: AsyncDispatchTransaction,
    input: QuestionRegenerationDispatchInput,
  ): Promise<void> {
    await this.enqueuePayload(
      transaction,
      {
        payloadKind: input.destination,
        jobId: input.jobId,
        attempt: input.attempt,
        payload: { jobId: input.jobId, attempt: input.attempt },
      },
      input.requestedAt,
    );
  }

  /** TTS 조립 단계가 같은 공용 lease relay를 재사용할 typed writer 경계 */
  async enqueueTts(
    transaction: AsyncDispatchTransaction,
    input: {
      jobId: string;
      attempt: number;
      commandFingerprint: string;
      requestedAt: Date;
    },
  ): Promise<void> {
    await this.enqueuePayload(
      transaction,
      {
        payloadKind: 'TTS',
        jobId: input.jobId,
        attempt: input.attempt,
        payload: {
          jobId: input.jobId,
          attempt: input.attempt,
          commandFingerprint: input.commandFingerprint,
        },
      },
      input.requestedAt,
    );
  }

  /** 상태 replay는 이미 commit된 동일 TTS outbox가 있을 때만 성공시킨다 */
  async assertTtsDispatch(
    transaction: Pick<AsyncDispatchTransaction, 'select'>,
    input: { jobId: string; attempt: number; commandFingerprint: string },
  ): Promise<void> {
    const idempotencyKey = idempotencyKeyFor('TTS', input.jobId, input.attempt);
    const rows = await transaction
      .select(storedSelection)
      .from(asyncDispatchOutbox)
      .where(eq(asyncDispatchOutbox.idempotencyKey, idempotencyKey))
      .limit(2);
    if (rows.length !== 1 || !rows[0]) {
      throw new AsyncDispatchOutboxError(
        'ASYNC_DISPATCH_OUTBOX_IDEMPOTENCY_CONFLICT',
      );
    }
    assertExactReplay(rows[0], {
      payloadKind: 'TTS',
      jobId: input.jobId,
      attempt: input.attempt,
      idempotencyKey,
      payload: {
        jobId: input.jobId,
        attempt: input.attempt,
        commandFingerprint: input.commandFingerprint,
      },
    });
  }

  private async enqueuePayload(
    transaction: Pick<AsyncDispatchTransaction, 'insert' | 'select'>,
    payload: AsyncDispatchPayload,
    requestedAt: Date,
  ): Promise<void> {
    if (payload.attempt < 0 || !Number.isSafeInteger(payload.attempt)) {
      throw new AsyncDispatchOutboxError(
        'ASYNC_DISPATCH_OUTBOX_IDEMPOTENCY_CONFLICT',
      );
    }
    const idempotencyKey = idempotencyKeyFor(
      payload.payloadKind,
      payload.jobId,
      payload.attempt,
    );
    const expected = { ...payload, idempotencyKey };
    const inserted = await transaction
      .insert(asyncDispatchOutbox)
      .values({
        payloadKind: payload.payloadKind,
        jobId: payload.jobId,
        attempt: payload.attempt,
        idempotencyKey,
        payload: payload.payload,
        availableAt: requestedAt,
        createdAt: requestedAt,
        updatedAt: requestedAt,
      })
      .onConflictDoNothing()
      .returning(storedSelection);
    if (inserted[0]) {
      assertExactReplay(inserted[0], expected);
      return;
    }

    const rows = await transaction
      .select(storedSelection)
      .from(asyncDispatchOutbox)
      .where(eq(asyncDispatchOutbox.idempotencyKey, idempotencyKey))
      .limit(2);
    if (rows.length !== 1 || !rows[0]) {
      throw new AsyncDispatchOutboxError(
        'ASYNC_DISPATCH_OUTBOX_IDEMPOTENCY_CONFLICT',
      );
    }
    assertExactReplay(rows[0], expected);
  }

  /** 미전달·가용·lease 만료 row를 SKIP LOCKED로 claim하고 새 owner를 발급한다 */
  async claimBatch(input: {
    workerId: string;
    batchSize: number;
    leaseDurationMs: number;
  }): Promise<ClaimedAsyncDispatchOutboxRow[]> {
    if (
      !Number.isSafeInteger(input.batchSize) ||
      input.batchSize < 1 ||
      input.batchSize > 100 ||
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs < 1
    ) {
      throw new AsyncDispatchOutboxError('ASYNC_DISPATCH_OUTBOX_INVALID_CLAIM');
    }
    const now = this.now();
    const leaseOwner = `${normalizeWorkerId(input.workerId)}:${this.createLeaseId()}`;
    const leaseExpiresAt = new Date(now.getTime() + input.leaseDurationMs);

    return this.database.transaction(async (transaction) => {
      const candidates = await transaction
        .select({ id: asyncDispatchOutbox.id })
        .from(asyncDispatchOutbox)
        .where(
          and(
            isNull(asyncDispatchOutbox.deliveredAt),
            lte(asyncDispatchOutbox.availableAt, now),
            or(
              isNull(asyncDispatchOutbox.leaseExpiresAt),
              lte(asyncDispatchOutbox.leaseExpiresAt, now),
            ),
          ),
        )
        .orderBy(
          asc(asyncDispatchOutbox.availableAt),
          asc(asyncDispatchOutbox.createdAt),
          asc(asyncDispatchOutbox.id),
        )
        .for('update', { skipLocked: true })
        .limit(input.batchSize);
      if (candidates.length === 0) return [];

      const rows = await transaction
        .update(asyncDispatchOutbox)
        .set({
          leaseOwner,
          leaseExpiresAt,
          deliveryAttempts: sql`${asyncDispatchOutbox.deliveryAttempts} + 1`,
          updatedAt: now,
        })
        .where(
          inArray(
            asyncDispatchOutbox.id,
            candidates.map(({ id }) => id),
          ),
        )
        .returning(claimedSelection);
      if (rows.length !== candidates.length) {
        throw new AsyncDispatchOutboxError(
          'ASYNC_DISPATCH_OUTBOX_PERSISTENCE_CONFLICT',
        );
      }
      return rows.map(mapClaimed);
    });
  }

  /** 활성 lease만 queue 수락을 완료하고 콘텐츠 job enqueue 시각도 함께 기록한다 */
  async acknowledge(input: {
    id: string;
    leaseOwner: string;
    deliveredAt: Date;
  }): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          payloadKind: asyncDispatchOutbox.payloadKind,
          jobId: asyncDispatchOutbox.jobId,
          attempt: asyncDispatchOutbox.attempt,
        })
        .from(asyncDispatchOutbox)
        .where(
          and(
            eq(asyncDispatchOutbox.id, input.id),
            eq(asyncDispatchOutbox.leaseOwner, input.leaseOwner),
            gt(asyncDispatchOutbox.leaseExpiresAt, input.deliveredAt),
            isNull(asyncDispatchOutbox.deliveredAt),
          ),
        )
        .for('update')
        .limit(2);
      if (rows.length !== 1 || !rows[0]) return false;
      const row = rows[0];

      if (row.payloadKind === 'CONTENT_PRODUCTION') {
        await transaction
          .update(jobs)
          .set({
            enqueuedAt: input.deliveredAt,
            updatedAt: input.deliveredAt,
          })
          .where(
            and(
              eq(jobs.id, row.jobId),
              eq(jobs.attempt, row.attempt),
              isNull(jobs.enqueuedAt),
            ),
          )
          .returning({ id: jobs.id });
      }
      const acknowledged = await transaction
        .update(asyncDispatchOutbox)
        .set({
          deliveredAt: input.deliveredAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: input.deliveredAt,
        })
        .where(
          and(
            eq(asyncDispatchOutbox.id, input.id),
            eq(asyncDispatchOutbox.leaseOwner, input.leaseOwner),
            gt(asyncDispatchOutbox.leaseExpiresAt, input.deliveredAt),
            isNull(asyncDispatchOutbox.deliveredAt),
          ),
        )
        .returning({ id: asyncDispatchOutbox.id });
      return acknowledged.length === 1;
    });
  }

  /** 활성 lease 실패를 safe code로 닫고 다음 retry 시각에 다시 가용하게 한다 */
  async release(input: {
    id: string;
    leaseOwner: string;
    failedAt: Date;
    nextAvailableAt: Date;
    errorCode: string;
  }): Promise<boolean> {
    const released = await this.database
      .update(asyncDispatchOutbox)
      .set({
        availableAt: input.nextAvailableAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: normalizeErrorCode(input.errorCode),
        lastErrorAt: input.failedAt,
        updatedAt: input.failedAt,
      })
      .where(
        and(
          eq(asyncDispatchOutbox.id, input.id),
          eq(asyncDispatchOutbox.leaseOwner, input.leaseOwner),
          gt(asyncDispatchOutbox.leaseExpiresAt, input.failedAt),
          isNull(asyncDispatchOutbox.deliveredAt),
        ),
      )
      .returning({ id: asyncDispatchOutbox.id });
    return released.length === 1;
  }
}
