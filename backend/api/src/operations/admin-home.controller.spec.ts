/** 관리자 홈 Controller의 ADMIN+MFA와 Swagger route 경계를 검증한다 */
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { AdminHomeController } from './admin-home.controller.js';

const admin = {
  userId: '01933b6a-8f13-7a19-b7e5-536d70f57aaa',
  sub: 'admin-sub',
  email: 'admin@hufs.ac.kr',
  role: 'ADMIN' as const,
  mfaEnrolledAt: new Date('2026-07-01T00:00:00.000Z'),
};

describe('AdminHomeController', () => {
  it('GET /admin/home에 Bearer·ADMIN·MFA guard를 적용한다', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminHomeController)).toBe(
      'admin/home',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminHomeController)).toEqual([
      CognitoAuthorizerGuard,
      ApplicationRoleGuard,
      AdminMfaGuard,
    ]);
    expect(Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminHomeController)).toBe(
      'ADMIN',
    );
  });

  it('현재 관리자를 service에 전달한다', async () => {
    const service = { get: vi.fn().mockResolvedValue({}) };

    await new AdminHomeController(service as never).get(admin);

    expect(service.get).toHaveBeenCalledWith({
      userId: admin.userId,
      role: 'ADMIN',
      mfaEnrolledAt: admin.mfaEnrolledAt,
    });
  });
});
