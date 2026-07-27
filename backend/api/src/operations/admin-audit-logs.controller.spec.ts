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
      }),
    ).resolves.toMatchObject({
      items: [{ id: auditId, createdAt: item.createdAt.toISOString() }],
    });
    expect(service.list).toHaveBeenCalledWith(
      { role: 'ADMIN' },
      expect.objectContaining({ page: 1 }),
    );
    const listCall = service.list.mock.calls[0] as unknown as [
      unknown,
      { from: unknown },
    ];
    expect(listCall[1].from).toBeInstanceOf(Date);
  });

  it('상세에서만 summary와 requestId를 직렬화한다', async () => {
    const service = {
      get: vi.fn().mockResolvedValue({
        ...item,
        summary: {
          before: 'ACTIVE',
          nested: {
            token: 'secret-token',
            values: [
              {
                totpCode: '123456',
                accessToken: 'access-token',
                clientSecret: 'client-secret',
                apiSecret: 'api-secret',
                bearerToken: 'bearer-token',
                loginCredential: 'credential',
                passwordHash: 'password-hash',
                privateSigningKey: 'private-key',
                verificationCode: 'verification-code',
                errorCode: 'SAFE_ERROR_CODE',
              },
              { safe: 'visible' },
            ],
          },
          privateKey: 'secret-private-key',
          after: 'DISABLED',
        },
        requestId: 'request-1',
      }),
    };
    const controller = new AdminAuditLogsController(service as never);

    await expect(
      controller.get(user, { auditLogId: auditId }),
    ).resolves.toEqual({
      ...item,
      createdAt: item.createdAt.toISOString(),
      summary: {
        before: 'ACTIVE',
        nested: {
          token: '[REDACTED]',
          values: [
            {
              totpCode: '[REDACTED]',
              accessToken: '[REDACTED]',
              clientSecret: '[REDACTED]',
              apiSecret: '[REDACTED]',
              bearerToken: '[REDACTED]',
              loginCredential: '[REDACTED]',
              passwordHash: '[REDACTED]',
              privateSigningKey: '[REDACTED]',
              verificationCode: '[REDACTED]',
              errorCode: 'SAFE_ERROR_CODE',
            },
            { safe: 'visible' },
          ],
        },
        privateKey: '[REDACTED]',
        after: 'DISABLED',
      },
      requestId: 'request-1',
    });
  });

  it('중첩 storage 객체 키와 정규화된 suffix 변형을 모두 가린다', async () => {
    const service = {
      get: vi.fn().mockResolvedValue({
        ...item,
        summary: {
          nested: {
            objectKey: 'private/object',
            input_key: 'private/input',
            'storage-key': 'private/storage',
            privateObjectKey: 'private/object-key',
            archiveStorageKey: 'private/archive',
            safeKey: 'visible',
          },
        },
        requestId: 'request-2',
      }),
    };
    const controller = new AdminAuditLogsController(service as never);

    await expect(
      controller.get(user, { auditLogId: auditId }),
    ).resolves.toMatchObject({
      summary: {
        nested: {
          objectKey: '[REDACTED]',
          input_key: '[REDACTED]',
          'storage-key': '[REDACTED]',
          privateObjectKey: '[REDACTED]',
          archiveStorageKey: '[REDACTED]',
          safeKey: 'visible',
        },
      },
    });
  });
});
