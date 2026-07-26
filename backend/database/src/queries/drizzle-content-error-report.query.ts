/** 관리자 콘텐츠 오류 신고 목록과 상세 read model을 조회한다 */
import type {
  AdminContentErrorReportListQuery,
  ContentErrorReport,
  ContentErrorReportDetail,
  ContentErrorReportQuery,
} from '@flex-thia/domain';
import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import * as baseSchema from '../schema/index.js';
import {
  contentErrorReportHistory,
  contentErrorReports,
} from '../schema/feedback.schema.js';

const feedbackSchema = {
  ...baseSchema,
  contentErrorReports,
  contentErrorReportHistory,
};
type FeedbackDatabase = PgDatabase<PgQueryResultHKT, typeof feedbackSchema>;

/** 관리자 오류 신고 stable page 응답 */
export interface ContentErrorReportPageProjection {
  items: ContentErrorReport[];
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 목록 결과와 count를 stable page metadata로 조립한다 */
export const toContentErrorReportPage = (
  items: ContentErrorReport[],
  totalItems: number,
  page: number,
  pageSize: number,
): ContentErrorReportPageProjection => ({
  items,
  totalItems,
  page,
  pageSize,
  totalPages: Math.ceil(totalItems / pageSize),
});

const mapReport = (
  row: typeof contentErrorReports.$inferSelect,
): ContentErrorReport => ({
  id: row.id,
  reporterUserId: row.reporterUserId,
  targetKind: row.targetKind,
  category: row.category,
  status: row.status,
  assigneeUserId: row.assigneeUserId,
  description: row.description,
  canonicalReference: row.canonicalReference,
  snapshot: row.snapshot,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** 관리자 오류 신고 filter와 append-only history를 조회한다 */
export class DrizzleContentErrorReportQuery implements ContentErrorReportQuery {
  constructor(private readonly database: FeedbackDatabase) {}

  /** filter 뒤 최신 접수순 stable page를 반환한다 */
  async list(query: AdminContentErrorReportListQuery) {
    const filters: SQL[] = [];
    if (query.status)
      filters.push(eq(contentErrorReports.status, query.status));
    if (query.targetKind)
      filters.push(eq(contentErrorReports.targetKind, query.targetKind));
    if (query.category)
      filters.push(eq(contentErrorReports.category, query.category));
    if (query.assigneeUserId)
      filters.push(
        eq(contentErrorReports.assigneeUserId, query.assigneeUserId),
      );
    const where = filters.length === 0 ? undefined : and(...filters);
    const [rows, totals] = await Promise.all([
      this.database
        .select()
        .from(contentErrorReports)
        .where(where)
        .orderBy(
          desc(contentErrorReports.createdAt),
          asc(contentErrorReports.id),
        )
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database
        .select({ value: count() })
        .from(contentErrorReports)
        .where(where),
    ]);
    return {
      items: rows.map(mapReport),
      totalItems: Number(totals[0]?.value ?? 0),
    };
  }

  /** 신고와 처리 이력을 시간순으로 반환한다 */
  async findById(reportId: string): Promise<ContentErrorReportDetail | null> {
    const rows = await this.database
      .select()
      .from(contentErrorReports)
      .where(eq(contentErrorReports.id, reportId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const history = await this.database
      .select()
      .from(contentErrorReportHistory)
      .where(eq(contentErrorReportHistory.reportId, reportId))
      .orderBy(
        asc(contentErrorReportHistory.createdAt),
        asc(contentErrorReportHistory.id),
      );
    return {
      report: mapReport(row),
      history: history.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actorUserId: entry.actorUserId,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        fromAssigneeUserId: entry.fromAssigneeUserId,
        toAssigneeUserId: entry.toAssigneeUserId,
        createdAt: entry.createdAt,
      })),
    };
  }
}
