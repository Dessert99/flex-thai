/** 관리자 감사 Controller의 guard·파싱·projection을 검증한다 */
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { AdminAuditLogsController } from './admin-audit-logs.controller.js';

const user = {
  userId: '00000000-0000-4000-8000-000000000001',
  sub: 'admin-sub',
  email: 'admin@hufs.ac.kr',
  role: 'ADMIN',
  mfaEnrolledAt: new Date(),
} as const;
const auditId = '00000000-0000-4000-8000-000000000002';
const item = {
  id: auditId,
  actor: { kind: 'SYSTEM' as const, label: 'migration' },
  action: 'MIGRATED',
  target: 'legacy',
  targetType: null,
  targetId: null,
  createdAt: new Date('2026-07-26T00:00:00.000Z'),
};

describe('AdminAuditLogsController', () => {
  it('Bearer·ADMIN·MFA guard를 class 전체에 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminAuditLogsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminAuditLogsController),
    ).toBe('ADMIN');
  });

  it('목록 query 기간을 Date로 바꾸고 list projection만 반환한다', async () => {
    const service = {
      list: vi.fn().mockResolvedValue({
        items: [item],
        page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      }),
    };
    const controller = new AdminAuditLogsController(service as never);

    await expect(
      controller.list(user, {
        from: '2026-07-01T00:00:00.000Z',
        page: '1',
        pageSize: '20',
      } as never),
    ).resolves.toMatchObject({
      items: [{ id: auditId, createdAt: item.createdAt.toISOString() }],
    });
    expect(service.list).toHaveBeenCalledWith(
      { role: 'ADMIN' },
      expect.objectContaining({ from: expect.any(Date), page: 1 }),
    );
  });

  it('상세에서만 summary와 requestId를 직렬화한다', async () => {
    const service = {
      get: vi.fn().mockResolvedValue({
        ...item,
        summary: { before: 'ACTIVE', after: 'DISABLED' },
        requestId: 'request-1',
      }),
    };
    const controller = new AdminAuditLogsController(service as never);

    await expect(controller.get(user, { auditLogId: auditId })).resolves.toEqual({
      ...item,
      createdAt: item.createdAt.toISOString(),
      summary: { before: 'ACTIVE', after: 'DISABLED' },
      requestId: 'request-1',
    });
  });
});
