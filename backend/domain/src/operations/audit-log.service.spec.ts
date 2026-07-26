/** 감사 기록 read use case의 권한·위임·404 정책을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { AuditLogError, AuditLogService } from './audit-log.service.js';

const query = {
  list: vi.fn(),
  findById: vi.fn(),
};
const service = new AuditLogService(query);
const actor = { role: 'ADMIN' as const };
const listQuery = { page: 1, pageSize: 20 };

describe('AuditLogService', () => {
  it('ADMIN의 목록 조건을 read port에 그대로 위임한다', async () => {
    const page = {
      items: [],
      page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    };
    query.list.mockResolvedValueOnce(page);

    await expect(service.list(actor, listQuery)).resolves.toBe(page);
    expect(query.list).toHaveBeenCalledWith(listQuery);
  });

  it('ADMIN이 아니면 감사 기록을 공개하지 않는다', async () => {
    await expect(
      service.list({ role: 'LEARNER' }, listQuery),
    ).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
  });

  it('없는 상세는 AUDIT_LOG_NOT_FOUND로 고정한다', async () => {
    query.findById.mockResolvedValueOnce(null);

    await expect(service.get(actor, 'missing')).rejects.toEqual(
      new AuditLogError('AUDIT_LOG_NOT_FOUND'),
    );
  });
});
