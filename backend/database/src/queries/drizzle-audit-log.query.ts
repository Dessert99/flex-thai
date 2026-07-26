/** append-only 감사 기록의 검색·페이지·상세 Drizzle read adapter를 정의한다 */
import type {
  AuditLogDetail,
  AuditLogListItem,
  AuditLogListQuery,
  AuditLogQuery,
} from '@flex-thia/domain';
import { and, count, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditLogs, users } from '../schema/index.js';
import * as schema from '../schema/index.js';

type AuditLogDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

const listSelection = {
  id: auditLogs.id,
  actorSub: auditLogs.actorSub,
  actorUserId: auditLogs.actorUserId,
  actorEmail: users.email,
  action: auditLogs.action,
  target: auditLogs.target,
  targetType: auditLogs.targetType,
  targetId: auditLogs.targetId,
  createdAt: auditLogs.createdAt,
};

interface AuditReadRow {
  id: string;
  actorSub: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  target: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
}

const toListItem = (row: AuditReadRow): AuditLogListItem => ({
  id: row.id,
  actor:
    row.actorUserId && row.actorEmail
      ? { kind: 'USER', userId: row.actorUserId, email: row.actorEmail }
      : { kind: 'SYSTEM', label: row.actorSub },
  action: row.action,
  target: row.target,
  targetType: row.targetType,
  targetId: row.targetId,
  createdAt: row.createdAt,
});

/** 감사 기록을 변경하지 않고 목록·상세만 읽는 adapter */
export class DrizzleAuditLogQuery implements AuditLogQuery {
  constructor(private readonly database: AuditLogDatabase) {}

  /** 검색·필터 조건에 맞는 stable 최신순 감사 페이지를 반환한다 */
  async list(query: AuditLogListQuery) {
    const escapedQuery = query.query?.replace(/[\\%_]/g, '\\$&');
    const condition = and(
      escapedQuery
        ? or(
            ilike(users.email, `%${escapedQuery}%`),
            ilike(auditLogs.action, `%${escapedQuery}%`),
            ilike(auditLogs.target, `%${escapedQuery}%`),
          )
        : undefined,
      query.actorUserId
        ? eq(auditLogs.actorUserId, query.actorUserId)
        : undefined,
      query.action ? eq(auditLogs.action, query.action) : undefined,
      query.targetType ? eq(auditLogs.targetType, query.targetType) : undefined,
      query.targetId ? eq(auditLogs.targetId, query.targetId) : undefined,
      query.from ? gte(auditLogs.createdAt, query.from) : undefined,
      query.to ? lte(auditLogs.createdAt, query.to) : undefined,
    );
    const [{ total = 0 } = {}] = await this.database
      .select({ total: count(auditLogs.id) })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(condition);
    const rows = await this.database
      .select(listSelection)
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(condition)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map(toListItem),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** UUID 감사 기록의 민감하지 않은 상세 projection을 반환한다 */
  async findById(id: string): Promise<AuditLogDetail | null> {
    const [row] = await this.database
      .select({
        ...listSelection,
        summary: auditLogs.summary,
        requestId: auditLogs.requestId,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(eq(auditLogs.id, id));
    if (!row) return null;
    return {
      ...toListItem(row),
      summary: row.summary,
      requestId: row.requestId,
    };
  }
}
