/** TTS 운영 작업·항목을 stable page와 민감하지 않은 projection으로 조회한다 */
import type {
  ContentTtsReadinessRepository,
  TtsItemListInput,
  TtsItemPage,
  TtsJob,
  TtsJobDetail,
  TtsJobListInput,
  TtsJobPage,
  TtsPublicationReadinessProjection,
} from '@flex-thia/domain';
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as schema from '../schema/index.js';
import {
  mediaAssets,
  questionVersions,
  ttsItems,
  ttsJobs,
} from '../schema/index.js';
import { DrizzleContentTtsReadinessQuery } from './drizzle-content-tts-readiness.query.js';

type TtsOperationsDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** lifecycle 입력과 분리해 운영 목록의 생성 시각 범위를 받는다 */
export interface TtsOperationsJobListInput extends TtsJobListInput {
  from?: Date;
  to?: Date;
}

/** lifecycle 입력과 분리해 운영 항목의 안정적인 오류 code를 받는다 */
export interface TtsOperationsItemListInput extends TtsItemListInput {
  errorCode?: string;
}

/** TTS 운영 화면이 읽기 전용으로 사용하는 job·item 조회 경계 */
export interface TtsOperationsQuery {
  listJobs(input: TtsOperationsJobListInput): Promise<TtsJobPage>;
  findJob(jobId: string): Promise<TtsJobDetail | null>;
  listItems(input: TtsOperationsItemListInput): Promise<TtsItemPage>;
  findAudioItem(itemId: string): Promise<{
    itemId: string;
    itemStatus: TtsItemPage['items'][number]['status'];
    mediaStatus: 'UPLOADING' | 'READY' | 'REJECTED' | null;
    storageKey: string | null;
  } | null>;
  getPublicationReadiness(input: {
    questionId: string;
    versionId: string;
  }): Promise<TtsPublicationReadinessProjection | null>;
}

const jobSelection = {
  id: ttsJobs.id,
  status: ttsJobs.status,
  requestedBy: ttsJobs.requestedBy,
  pendingCount: ttsJobs.pendingCount,
  processingCount: ttsJobs.processingCount,
  succeededCount: ttsJobs.succeededCount,
  failedCount: ttsJobs.failedCount,
  createdAt: ttsJobs.createdAt,
  startedAt: ttsJobs.startedAt,
  finishedAt: ttsJobs.finishedAt,
};

const itemSelection = {
  id: ttsItems.id,
  targetKind: ttsItems.targetKind,
  targetId: ttsItems.targetId,
  targetText: ttsItems.targetText,
  targetRequired: ttsItems.targetRequired,
  revision: ttsItems.revision,
  status: ttsItems.status,
  attempt: ttsItems.attempt,
  errorCode: ttsItems.errorCode,
  retryable: ttsItems.retryable,
  mediaAssetId: ttsItems.mediaAssetId,
};

interface JobRow {
  id: string;
  status: TtsJob['status'];
  requestedBy: string;
  pendingCount: number;
  processingCount: number;
  succeededCount: number;
  failedCount: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

const toJob = (row: JobRow): TtsJob => ({
  id: row.id,
  status: row.status,
  requestedBy: row.requestedBy,
  counts: {
    pending: row.pendingCount,
    processing: row.processingCount,
    succeeded: row.succeededCount,
    failed: row.failedCount,
  },
  createdAt: row.createdAt,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
});

/** TTS 운영 목록·상세 projection을 storage/provider 비밀값 없이 조립한다 */
export class DrizzleTtsOperationsQuery implements TtsOperationsQuery {
  private readonly readiness: ContentTtsReadinessRepository;

  constructor(
    private readonly database: TtsOperationsDatabase,
    readiness?: ContentTtsReadinessRepository,
  ) {
    this.readiness =
      readiness ?? new DrizzleContentTtsReadinessQuery(database);
  }

  /** 상태·생성 기간을 함께 적용한 최신 job page를 반환한다 */
  async listJobs(input: TtsOperationsJobListInput): Promise<TtsJobPage> {
    const condition = and(
      input.status ? eq(ttsJobs.status, input.status) : undefined,
      input.from ? gte(ttsJobs.createdAt, input.from) : undefined,
      input.to ? lte(ttsJobs.createdAt, input.to) : undefined,
    );
    const [{ totalItems = 0 } = {}] = await this.database
      .select({ totalItems: count(ttsJobs.id) })
      .from(ttsJobs)
      .where(condition);
    const rows = await this.database
      .select(jobSelection)
      .from(ttsJobs)
      .where(condition)
      .orderBy(desc(ttsJobs.createdAt), desc(ttsJobs.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    return {
      items: rows.map((row) => toJob(row)),
      page: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / input.pageSize),
      },
    };
  }

  /** job voice snapshot과 저장된 item aggregate를 함께 반환한다 */
  async findJob(jobId: string): Promise<TtsJobDetail | null> {
    const [row] = await this.database
      .select({ ...jobSelection, voiceSnapshot: ttsJobs.voiceSnapshot })
      .from(ttsJobs)
      .where(eq(ttsJobs.id, jobId))
      .limit(1);
    if (!row) return null;
    return {
      ...toJob(row),
      voice: row.voiceSnapshot,
    };
  }

  /** job 안의 상태·오류 조건 항목을 최신순 page로 반환한다 */
  async listItems(input: TtsOperationsItemListInput): Promise<TtsItemPage> {
    const condition = and(
      eq(ttsItems.jobId, input.jobId),
      input.status ? eq(ttsItems.status, input.status) : undefined,
      input.errorCode ? eq(ttsItems.errorCode, input.errorCode) : undefined,
    );
    const [{ totalItems = 0 } = {}] = await this.database
      .select({ totalItems: count(ttsItems.id) })
      .from(ttsItems)
      .where(condition);
    const rows = await this.database
      .select(itemSelection)
      .from(ttsItems)
      .where(condition)
      .orderBy(desc(ttsItems.createdAt), desc(ttsItems.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    return {
      items: rows.map((row) => ({
        id: row.id,
        target: {
          kind: row.targetKind,
          targetId: row.targetId,
          text: row.targetText,
          required: row.targetRequired,
          revision: row.revision,
        },
        status: row.status,
        attempt: row.attempt,
        errorCode: row.errorCode,
        retryable: row.retryable,
        mediaAssetId: row.mediaAssetId,
      })),
      page: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / input.pageSize),
      },
    };
  }

  /** 항목 상태와 연결 media의 내부 storage key를 재생 서비스에만 제공한다 */
  async findAudioItem(itemId: string) {
    const [row] = await this.database
      .select({
        itemId: ttsItems.id,
        itemStatus: ttsItems.status,
        mediaStatus: mediaAssets.status,
        storageKey: mediaAssets.storageKey,
      })
      .from(ttsItems)
      .leftJoin(mediaAssets, eq(ttsItems.mediaAssetId, mediaAssets.id))
      .where(eq(ttsItems.id, itemId))
      .limit(1);
    return row ?? null;
  }

  /** 문제/version ownership과 필수 media truth를 최신 TTS 작업 metadata로 보강한다 */
  async getPublicationReadiness(input: {
    questionId: string;
    versionId: string;
  }): Promise<TtsPublicationReadinessProjection | null> {
    const [version] = await this.database
      .select({ id: questionVersions.id })
      .from(questionVersions)
      .where(
        and(
          eq(questionVersions.id, input.versionId),
          eq(questionVersions.questionId, input.questionId),
        ),
      )
      .limit(1);
    if (!version) return null;

    const targets = await this.readiness.listRequiredTargets(input);
    const blockers = targets.filter(
      (
        target,
      ): target is typeof target & {
        mediaStatus: 'MISSING' | 'UPLOADING' | 'FAILED';
      } => target.mediaStatus !== 'READY',
    );
    const targetIds = blockers.map((target) => target.targetId);
    const rows =
      targetIds.length === 0
        ? []
        : await this.database
            .select({
              jobId: ttsItems.jobId,
              itemId: ttsItems.id,
              targetKind: ttsItems.targetKind,
              targetId: ttsItems.targetId,
              itemStatus: ttsItems.status,
              attempt: ttsItems.attempt,
              errorCode: ttsItems.errorCode,
              retryable: ttsItems.retryable,
            })
            .from(ttsItems)
            .where(
              and(
                inArray(ttsItems.targetId, targetIds),
                inArray(ttsItems.targetKind, [
                  'THAI_SENTENCE_VERSION',
                  'VOCABULARY_PRONUNCIATION',
                ]),
                eq(ttsItems.revision, input.versionId),
              ),
            )
            .orderBy(desc(ttsItems.updatedAt), desc(ttsItems.id));
    const operationByTarget = new Map<
      string,
      (typeof rows)[number]
    >();
    for (const row of rows) {
      const key = `${row.targetKind}:${row.targetId}`;
      if (!operationByTarget.has(key)) operationByTarget.set(key, row);
    }

    return {
      ready: blockers.length === 0,
      requiredCount: targets.length,
      readyCount: targets.length - blockers.length,
      blockers: blockers.map((target) => {
        const operation = operationByTarget.get(
          `${target.kind}:${target.targetId}`,
        );
        return {
          kind: target.kind,
          targetId: target.targetId,
          mediaStatus: target.mediaStatus,
          operation: operation
            ? {
                jobId: operation.jobId,
                itemId: operation.itemId,
                itemStatus: operation.itemStatus,
                attempt: operation.attempt,
                errorCode: operation.errorCode,
                retryable: operation.retryable,
              }
            : null,
        };
      }),
    };
  }
}
