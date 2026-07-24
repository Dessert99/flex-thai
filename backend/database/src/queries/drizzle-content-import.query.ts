/** 전체 관리자 콘텐츠 가져오기 이력을 private field 없이 stable page/detail로 조회한다 */
import type {
  ContentImportDetail,
  ContentImportFinalStatus,
  ContentImportItemError,
  ContentImportResultItem,
} from '@flex-thia/domain';
import { and, asc, count, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { contentImportItems, contentImports } from '../schema/index.js';
import * as schema from '../schema/index.js';

type ContentImportDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 검증 완료 page 번호와 크기 */
export interface ContentImportPageQuery {
  page: number;
  pageSize: number;
}

/** 관리자 목록 응답의 page metadata */
export interface ContentImportPageMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** 항목 상세 없이 공개할 완료 import 요약 */
export interface ContentImportSummaryProjection {
  id: string;
  status: ContentImportFinalStatus;
  vocabularyCount: number;
  questionCount: number;
  importedCount: number;
  rejectedCount: number;
  createdAt: Date;
  completedAt: Date;
}

/** 전체 관리자 import 이력의 page projection */
export interface ContentImportListProjection {
  items: ContentImportSummaryProjection[];
  page: ContentImportPageMetadata;
}

/** 완료 row/item 무결성 손상을 private DB 값 없이 전달한다 */
export class ContentImportQueryError extends Error {
  readonly code = 'CONTENT_IMPORT_QUERY_INTEGRITY_ERROR';

  constructor(readonly operation: string) {
    super(`CONTENT_IMPORT_QUERY_INTEGRITY_ERROR:${operation}`);
    this.name = 'ContentImportQueryError';
  }
}

interface SummaryRow {
  id: string;
  status: ContentImportFinalStatus | null;
  vocabularyCount: number;
  questionCount: number;
  importedCount: number;
  rejectedCount: number;
  createdAt: Date;
  completedAt: Date | null;
}

const toSummary = (
  row: SummaryRow,
  operation: string,
): ContentImportSummaryProjection => {
  if (row.status === null || row.completedAt === null) {
    throw new ContentImportQueryError(operation);
  }
  return {
    id: row.id,
    status: row.status,
    vocabularyCount: row.vocabularyCount,
    questionCount: row.questionCount,
    importedCount: row.importedCount,
    rejectedCount: row.rejectedCount,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
};

const toItem = (row: {
  kind: 'VOCABULARY' | 'QUESTION';
  sourceIndex: number;
  status: 'IMPORTED' | 'REJECTED';
  targetId: string | null;
  errors: ContentImportItemError[];
}): ContentImportResultItem => {
  if (
    row.status === 'IMPORTED' &&
    row.targetId !== null &&
    row.errors.length === 0
  ) {
    return {
      kind: row.kind,
      sourceIndex: row.sourceIndex,
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
      status: row.status,
      targetId: null,
      errors: row.errors,
    };
  }
  throw new ContentImportQueryError('mapItem');
};

const summarySelection = {
  id: contentImports.id,
  status: contentImports.status,
  vocabularyCount: contentImports.vocabularyCount,
  questionCount: contentImports.questionCount,
  importedCount: contentImports.importedCount,
  rejectedCount: contentImports.rejectedCount,
  createdAt: contentImports.createdAt,
  completedAt: contentImports.completedAt,
};

/** requester 필터 없이 모든 완료 import를 공개 계약용 projection으로 읽는다 */
export class DrizzleContentImportQuery {
  constructor(private readonly database: ContentImportDatabase) {}

  /** 완료 이력을 createdAt·ID 내림차순으로 고정해 page를 반환한다 */
  async list(
    query: ContentImportPageQuery,
  ): Promise<ContentImportListProjection> {
    const [totalRow] = await this.database
      .select({ totalItems: count() })
      .from(contentImports)
      .where(isNotNull(contentImports.status));
    const totalItems = totalRow?.totalItems ?? 0;
    const rows = await this.database
      .select(summarySelection)
      .from(contentImports)
      .where(isNotNull(contentImports.status))
      .orderBy(desc(contentImports.createdAt), desc(contentImports.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map((row) => toSummary(row, 'list')),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  /** 완료 import와 vocabulary-first item 결과를 내부 참조 없이 반환한다 */
  async findById(importId: string): Promise<ContentImportDetail | null> {
    const [row] = await this.database
      .select(summarySelection)
      .from(contentImports)
      .where(
        and(eq(contentImports.id, importId), isNotNull(contentImports.status)),
      )
      .limit(1);
    if (!row || row.status === null || row.completedAt === null) {
      return null;
    }
    const itemRows = await this.database
      .select({
        kind: contentImportItems.kind,
        sourceIndex: contentImportItems.sourceIndex,
        status: contentImportItems.status,
        targetId: contentImportItems.targetId,
        errors: contentImportItems.errors,
      })
      .from(contentImportItems)
      .where(eq(contentImportItems.importId, importId))
      // kind enum의 사전 순서에 기대지 않고 승인된 vocabulary-first 순서를 고정한다.
      .orderBy(
        asc(
          sql<number>`case when ${contentImportItems.kind} = 'VOCABULARY' then 0 else 1 end`,
        ),
        asc(contentImportItems.sourceIndex),
      );
    return {
      ...toSummary(row, 'findById'),
      items: itemRows.map(toItem),
    };
  }
}
