/** 관리자 오류 신고 Controller의 ADMIN MFA 경계를 검증한다 */
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { AdminContentErrorReportsController } from './admin-content-error-reports.controller.js';

describe('AdminContentErrorReportsController', () => {
  it('Cognito와 ADMIN 역할 및 MFA guard를 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminContentErrorReportsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
  });
});
