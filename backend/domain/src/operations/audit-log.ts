/** append-only 감사 기록의 읽기 전용 domain port와 모델을 정의한다 */

/** 감사 행위 주체 */
export type AuditLogActor =
  | { kind: 'USER'; userId: string; email: string }
  | { kind: 'SYSTEM'; label: string };

/** 감사 목록 항목 */
export interface AuditLogListItem {
  id: string;
  actor: AuditLogActor;
  action: string;
  target: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
}

/** 상세에서만 공개하는 감사 기록 */
export interface AuditLogDetail extends AuditLogListItem {
  summary: Record<string, unknown>;
  requestId: string;
}

/** 감사 기록 검색·필터·페이지 조건 */
export interface AuditLogListQuery {
  query?: string;
  actorUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

/** 감사 기록 페이지 */
export interface AuditLogPage {
  items: AuditLogListItem[];
  page: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/** 감사 기록을 변경하지 않는 read port */
export interface AuditLogQuery {
  list(query: AuditLogListQuery): Promise<AuditLogPage>;
  findById(id: string): Promise<AuditLogDetail | null>;
}
