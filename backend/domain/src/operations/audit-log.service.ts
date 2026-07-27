/** 관리자 감사 기록 목록·상세 use case를 정의한다 */
import type {
  AuditLogDetail,
  AuditLogListQuery,
  AuditLogPage,
  AuditLogQuery,
} from './audit-log.js';

/** 감사 기록 조회 실패를 stable code로 전달한다 */
export class AuditLogError extends Error {
  constructor(readonly code: 'ADMIN_REQUIRED' | 'AUDIT_LOG_NOT_FOUND') {
    super(code);
    this.name = 'AuditLogError';
  }
}

/** 관리자 감사 기록 read use case */
export class AuditLogService {
  constructor(private readonly auditLogs: AuditLogQuery) {}

  /** ADMIN에게만 감사 기록 페이지를 반환한다 */
  async list(
    actor: { role: 'LEARNER' | 'ADMIN' },
    query: AuditLogListQuery,
  ): Promise<AuditLogPage> {
    assertAdmin(actor);
    return this.auditLogs.list(query);
  }

  /** ADMIN에게만 감사 기록 상세를 반환한다 */
  async get(
    actor: { role: 'LEARNER' | 'ADMIN' },
    id: string,
  ): Promise<AuditLogDetail> {
    assertAdmin(actor);
    const detail = await this.auditLogs.findById(id);
    if (!detail) throw new AuditLogError('AUDIT_LOG_NOT_FOUND');
    return detail;
  }
}

const assertAdmin = (actor: { role: 'LEARNER' | 'ADMIN' }): void => {
  if (actor.role !== 'ADMIN') throw new AuditLogError('ADMIN_REQUIRED');
};
