/** 관리자 media 생성·terminal 전이와 audit을 Drizzle transaction으로 구현한다 */
import {
  MediaAssetDomainError,
  completeMediaAsset,
  rejectMediaAsset,
  type MediaAdminRepository,
  type MediaAsset,
  type MediaAssetAuditContext,
  type ReadyMediaAsset,
} from '@flex-thia/domain';
import { and, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditLogs, mediaAssets } from '../schema/index.js';
import * as schema from '../schema/index.js';

type MediaAdminDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type MediaAdminSession = Pick<
  MediaAdminDatabase,
  'insert' | 'select' | 'update'
>;
type MediaAssetRow = typeof mediaAssets.$inferSelect;

/** 예상하지 못한 media 저장 충돌을 stable code로 전달한다 */
export class MediaAdminPersistenceError extends Error {
  readonly code = 'MEDIA_ADMIN_PERSISTENCE_CONFLICT';

  constructor(readonly operation: string) {
    super(`MEDIA_ADMIN_PERSISTENCE_CONFLICT:${operation}`);
    this.name = 'MediaAdminPersistenceError';
  }
}

const toMediaAsset = (row: MediaAssetRow): MediaAsset => {
  const base = {
    id: row.id,
    kind: row.kind,
    storageKey: row.storageKey,
    declaredMimeType: row.declaredMimeType,
    declaredSizeBytes: row.declaredSizeBytes,
    declaredSha256: row.declaredSha256,
  };
  if (row.status === 'READY') {
    if (
      row.mimeType === null ||
      row.sizeBytes === null ||
      row.sha256 === null ||
      row.readyAt === null
    ) {
      throw new MediaAdminPersistenceError('mapReady');
    }
    return {
      ...base,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      status: 'READY',
      readyAt: row.readyAt,
    };
  }
  return {
    ...base,
    mimeType: null,
    sizeBytes: null,
    sha256: null,
    status: row.status,
    readyAt: null,
  };
};

const appendAudit = async (
  transaction: MediaAdminSession,
  input: {
    context: MediaAssetAuditContext;
    action:
      | 'MEDIA_ASSET_UPLOAD_REQUESTED'
      | 'MEDIA_ASSET_READY'
      | 'MEDIA_ASSET_REJECTED';
    mediaAssetId: string;
    summary: Record<string, unknown>;
  },
): Promise<void> => {
  await transaction.insert(auditLogs).values({
    actorSub: input.context.actorSub,
    actorUserId: input.context.actorUserId,
    action: input.action,
    target: input.mediaAssetId,
    targetType: 'MEDIA_ASSET',
    targetId: input.mediaAssetId,
    summary: input.summary,
    requestId: input.context.requestId,
  });
};

const assertUpdated = (
  rows: Array<{ id: string }>,
  operation: string,
): void => {
  if (rows.length !== 1) {
    throw new MediaAdminPersistenceError(operation);
  }
};

/** READY 재사용 조회와 row-lock terminal 전이를 구현하는 repository */
export class DrizzleMediaAdminRepository implements MediaAdminRepository {
  constructor(private readonly database: MediaAdminDatabase) {}

  /** actual metadata가 모두 같은 READY 자산 하나만 재사용 후보로 반환한다 */
  async findReadyByMetadata(
    input: Parameters<MediaAdminRepository['findReadyByMetadata']>[0],
  ): ReturnType<MediaAdminRepository['findReadyByMetadata']> {
    const [row] = await this.database
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.status, 'READY'),
          eq(mediaAssets.mimeType, input.mimeType),
          eq(mediaAssets.sizeBytes, input.sizeBytes),
          eq(mediaAssets.sha256, input.sha256),
        ),
      )
      .limit(1);
    return row ? (toMediaAsset(row) as ReadyMediaAsset) : null;
  }

  /** UPLOADING row와 요청 audit이 따로 commit되지 않게 묶는다 */
  async createUploadingWithAudit(
    input: Parameters<MediaAdminRepository['createUploadingWithAudit']>[0],
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.insert(mediaAssets).values(input.asset);
      await appendAudit(transaction, {
        context: input.context,
        action: 'MEDIA_ASSET_UPLOAD_REQUESTED',
        mediaAssetId: input.asset.id,
        summary: {
          mimeType: input.asset.declaredMimeType,
          sizeBytes: input.asset.declaredSizeBytes,
          sha256: input.asset.declaredSha256,
        },
      });
    });
  }

  /** 외부 inspection 전에 storage key를 얻되 공개 projection과 분리한다 */
  async findById(
    mediaAssetId: string,
  ): ReturnType<MediaAdminRepository['findById']> {
    const [row] = await this.database
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId))
      .limit(1);
    return row ? toMediaAsset(row) : null;
  }

  /** lock 뒤 상태를 재확인해 terminal update와 audit을 같은 transaction에 둔다 */
  async finalizeWithAudit(
    input: Parameters<MediaAdminRepository['finalizeWithAudit']>[0],
  ): ReturnType<MediaAdminRepository['finalizeWithAudit']> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, input.mediaAssetId))
        .limit(1)
        .for('update');
      if (!row) return null;

      const asset = toMediaAsset(row);
      if (asset.status === 'READY') {
        return { outcome: 'READY_UNCHANGED', asset };
      }

      try {
        const ready = completeMediaAsset(
          asset,
          input.inspection,
          input.readyAt,
        );
        const rows = await transaction
          .update(mediaAssets)
          .set({
            mimeType: ready.mimeType,
            sizeBytes: ready.sizeBytes,
            sha256: ready.sha256,
            status: 'READY',
            readyAt: ready.readyAt,
          })
          .where(
            and(
              eq(mediaAssets.id, ready.id),
              eq(mediaAssets.status, 'UPLOADING'),
            ),
          )
          .returning({ id: mediaAssets.id });
        assertUpdated(rows, 'markReady');
        await appendAudit(transaction, {
          context: input.context,
          action: 'MEDIA_ASSET_READY',
          mediaAssetId: ready.id,
          summary: {
            mimeType: ready.mimeType,
            sizeBytes: ready.sizeBytes,
            sha256: ready.sha256,
          },
        });
        return { outcome: 'READY', asset: ready };
      } catch (error) {
        if (
          !(error instanceof MediaAssetDomainError) ||
          error.code !== 'MEDIA_INSPECTION_MISMATCH'
        ) {
          throw error;
        }
        const rejected = rejectMediaAsset(asset);
        const rows = await transaction
          .update(mediaAssets)
          .set({ status: 'REJECTED' })
          .where(
            and(
              eq(mediaAssets.id, rejected.id),
              eq(mediaAssets.status, 'UPLOADING'),
            ),
          )
          .returning({ id: mediaAssets.id });
        assertUpdated(rows, 'markRejected');
        await appendAudit(transaction, {
          context: input.context,
          action: 'MEDIA_ASSET_REJECTED',
          mediaAssetId: rejected.id,
          summary: { reason: 'MEDIA_INSPECTION_MISMATCH' },
        });
        return { outcome: 'REJECTED', asset: rejected };
      }
    });
  }
}
