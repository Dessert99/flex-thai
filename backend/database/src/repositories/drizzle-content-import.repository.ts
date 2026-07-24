/** 콘텐츠 가져오기 멱등 claim·REJECTED item·최초 완료를 Drizzle transaction으로 저장한다 */
import type {
  ClaimContentImportInput,
  CompleteContentImportInput,
  ContentImportDetail,
  ContentImportItemError,
  ContentImportRecord,
  ContentImportRepository,
  ContentImportStoredItem,
  SaveRejectedContentImportItemInput,
} from '@flex-thia/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { DrizzleContentImportQuery } from '../queries/drizzle-content-import.query.js';
import {
  auditLogs,
  contentImportItems,
  contentImports,
} from '../schema/index.js';
import * as schema from '../schema/index.js';

type ContentImportDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type ContentImportSession = Pick<
  ContentImportDatabase,
  'insert' | 'select' | 'update'
>;

/** 완료 집계나 unique row 재조회 무결성 실패를 stable 내부 code로 전달한다 */
export class ContentImportPersistenceError extends Error {
  readonly code = 'CONTENT_IMPORT_PERSISTENCE_CONFLICT';

  constructor(readonly operation: string) {
    super(`CONTENT_IMPORT_PERSISTENCE_CONFLICT:${operation}`);
    this.name = 'ContentImportPersistenceError';
  }
}

const assertExactlyOne = <T>(rows: T[], operation: string): T => {
  if (rows.length !== 1) {
    throw new ContentImportPersistenceError(operation);
  }
  return rows[0] as T;
};

const mapStoredItem = (row: {
  kind: 'VOCABULARY' | 'QUESTION';
  sourceIndex: number;
  clientRef: string;
  status: 'IMPORTED' | 'REJECTED';
  targetId: string | null;
  errors: ContentImportItemError[];
}): ContentImportStoredItem => {
  if (
    row.status === 'IMPORTED' &&
    row.targetId !== null &&
    row.errors.length === 0
  ) {
    return {
      kind: row.kind,
      sourceIndex: row.sourceIndex,
      clientRef: row.clientRef,
      status: row.status,
      targetId: row.targetId,
      errors: [],
    };
  }
  if (
    row.status === 'REJECTED' &&
    row.targetId === null &&
    row.errors.length > 0
  ) {
    return {
      kind: row.kind,
      sourceIndex: row.sourceIndex,
      clientRef: row.clientRef,
      status: row.status,
      targetId: null,
      errors: row.errors,
    };
  }
  throw new ContentImportPersistenceError('mapStoredItem');
};

const findItem = async (
  session: Pick<ContentImportSession, 'select'>,
  importId: string,
  kind: ContentImportStoredItem['kind'],
  sourceIndex: number,
): Promise<ContentImportStoredItem | null> => {
  const rows = await session
    .select({
      kind: contentImportItems.kind,
      sourceIndex: contentImportItems.sourceIndex,
      clientRef: contentImportItems.clientRef,
      status: contentImportItems.status,
      targetId: contentImportItems.targetId,
      errors: contentImportItems.errors,
    })
    .from(contentImportItems)
    .where(
      and(
        eq(contentImportItems.importId, importId),
        eq(contentImportItems.kind, kind),
        eq(contentImportItems.sourceIndex, sourceIndex),
      ),
    )
    .limit(2);
  if (rows.length > 1) {
    throw new ContentImportPersistenceError('findItem');
  }
  return rows[0] ? mapStoredItem(rows[0]) : null;
};

/** PostgreSQL unique·row lock으로 import orchestration port를 구현한다 */
export class DrizzleContentImportRepository implements ContentImportRepository {
  private readonly query: DrizzleContentImportQuery;

  constructor(private readonly database: ContentImportDatabase) {
    this.query = new DrizzleContentImportQuery(database);
  }

  /** user/key unique insert 뒤 canonical hash를 포함한 기존 또는 신규 row를 읽는다 */
  async claim(input: ClaimContentImportInput): Promise<ContentImportRecord> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .insert(contentImports)
        .values(input)
        .onConflictDoNothing({
          target: [contentImports.requestedBy, contentImports.idempotencyKey],
        })
        .returning({ id: contentImports.id });
      const rows = await transaction
        .select()
        .from(contentImports)
        .where(
          and(
            eq(contentImports.requestedBy, input.requestedBy),
            eq(contentImports.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(2);
      return assertExactlyOne(rows, 'claim');
    });
  }

  /** unique kind/source index item의 공개 판정 필드만 읽는다 */
  async findItem(
    importId: string,
    kind: ContentImportStoredItem['kind'],
    sourceIndex: number,
  ): Promise<ContentImportStoredItem | null> {
    return findItem(this.database, importId, kind, sourceIndex);
  }

  /** 예상 draft 오류를 별도 transaction에 first-writer-wins로 기록한다 */
  async saveRejectedItem(
    input: SaveRejectedContentImportItemInput,
  ): Promise<ContentImportStoredItem> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .insert(contentImportItems)
        .values({
          importId: input.importId,
          kind: input.kind,
          sourceIndex: input.sourceIndex,
          clientRef: input.clientRef,
          status: 'REJECTED',
          targetId: null,
          errors: input.errors,
          referenceMap: {},
        })
        .onConflictDoNothing({
          target: [
            contentImportItems.importId,
            contentImportItems.kind,
            contentImportItems.sourceIndex,
          ],
        });
      const item = await findItem(
        transaction,
        input.importId,
        input.kind,
        input.sourceIndex,
      );
      if (!item) {
        throw new ContentImportPersistenceError('saveRejectedItem');
      }
      return item;
    });
  }

  /** row lock 아래 unique item 수가 total일 때만 final count·status·audit을 commit한다 */
  async complete(input: CompleteContentImportInput): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const importRows = await transaction
        .select()
        .from(contentImports)
        .where(eq(contentImports.id, input.importId))
        .for('update')
        .limit(2);
      const current = assertExactlyOne(importRows, 'completeImport');
      if (current.status !== null) {
        return;
      }

      const itemRows = await transaction
        .select({ status: contentImportItems.status })
        .from(contentImportItems)
        .where(eq(contentImportItems.importId, input.importId));
      const expectedTotal = current.vocabularyCount + current.questionCount;
      if (itemRows.length !== expectedTotal) {
        throw new ContentImportPersistenceError('completeItemCount');
      }
      const importedCount = itemRows.filter(
        ({ status }) => status === 'IMPORTED',
      ).length;
      const rejectedCount = itemRows.length - importedCount;
      const status =
        rejectedCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_FAILURES';
      const updated = await transaction
        .update(contentImports)
        .set({
          status,
          importedCount,
          rejectedCount,
          completedAt: input.completedAt,
        })
        .where(
          and(
            eq(contentImports.id, input.importId),
            isNull(contentImports.status),
          ),
        )
        .returning({ id: contentImports.id });
      if (updated.length === 0) {
        return;
      }
      assertExactlyOne(updated, 'completeUpdate');
      await transaction.insert(auditLogs).values({
        actorSub: input.context.actorSub,
        actorUserId: input.context.actorUserId,
        action: 'CONTENT_IMPORT_COMPLETED',
        target: input.importId,
        targetType: 'CONTENT_IMPORT',
        targetId: input.importId,
        summary: {
          importedCount,
          rejectedCount,
          status,
        },
        requestId: input.context.requestId,
        createdAt: input.context.occurredAt,
      });
    });
  }

  /** service replay도 query와 같은 private-field-free 완료 상세를 사용한다 */
  async findDetail(importId: string): Promise<ContentImportDetail | null> {
    return this.query.findById(importId);
  }
}
