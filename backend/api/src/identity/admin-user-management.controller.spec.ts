/** 관리자 사용자 관리 Controller의 guard·계약·actor 전달을 검증한다 */
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from './admin-mfa.guard.js';
import { AdminUserManagementController } from './admin-user-management.controller.js';
import { ApplicationRoleGuard } from './application-role.guard.js';
import { CognitoAuthorizerGuard } from './cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from './require-role.decorator.js';

const user = {
  userId: '00000000-0000-4000-8000-000000000001',
  sub: 'admin-sub',
  email: 'admin@hufs.ac.kr',
  role: 'ADMIN',
  mfaEnrolledAt: new Date(),
} as const;
const target = {
  id: '00000000-0000-4000-8000-000000000002',
  cognitoSub: 'learner-sub',
  email: 'learner@hufs.ac.kr',
  role: 'LEARNER',
  status: 'ACTIVE',
  mfaEnrolledAt: null,
  createdAt: new Date('2026-07-26T00:00:00.000Z'),
  updatedAt: new Date('2026-07-26T00:00:00.000Z'),
} as const;

describe('AdminUserManagementController 보호 경계', () => {
  it('Bearer·ADMIN·MFA guard를 class 전체에 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminUserManagementController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminUserManagementController),
    ).toBe('ADMIN');
  });
});

describe('AdminUserManagementController 공개 계약', () => {
  it('목록과 상태 변경을 공개 JSON으로 직렬화한다', async () => {
    const service = {
      listUsers: vi.fn().mockResolvedValue([target]),
      changeStatus: vi
        .fn()
        .mockResolvedValue({ ...target, status: 'DISABLED' }),
    };
    const controller = new AdminUserManagementController(service as never);

    await expect(controller.listUsers(user, 'request-1')).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: target.id,
          mfaEnrolled: false,
          status: 'ACTIVE',
          createdAt: target.createdAt.toISOString(),
        }),
      ],
    });
    await controller.changeStatus(
      user,
      'request-1',
      { userId: target.id },
      { status: 'DISABLED' },
    );

    expect(service.changeStatus).toHaveBeenCalledWith(
      {
        actorSub: user.sub,
        actorUserId: user.userId,
        requestId: 'request-1',
        role: 'ADMIN',
      },
      target.id,
      'DISABLED',
      expect.any(Date),
    );
  });

  it('beta 안내를 가입 권한이 아닌 발송 추적 응답으로 반환한다', async () => {
    const invitation = {
      id: '00000000-0000-4000-8000-000000000003',
      email: 'new@hufs.ac.kr',
      invitedByUserId: user.userId,
      sentAt: new Date('2026-07-26T00:00:00.000Z'),
    };
    const service = {
      recordBetaInvitation: vi.fn().mockResolvedValue(invitation),
    };
    const controller = new AdminUserManagementController(service as never);

    await expect(
      controller.recordBetaInvitation(user, 'request-1', {
        email: ' New@HUFS.ac.kr ',
      }),
    ).resolves.toEqual({
      ...invitation,
      sentAt: invitation.sentAt.toISOString(),
    });
    expect(service.recordBetaInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: user.userId }),
      'new@hufs.ac.kr',
      expect.any(Date),
    );
  });
});
