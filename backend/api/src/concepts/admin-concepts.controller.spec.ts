/** 관리자 개념 controller의 역할·TOTP 경계를 검증한다 */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { AdminConceptsController } from './admin-concepts.controller.js';

describe('AdminConceptsController', () => {
  it('인증·ADMIN 역할·TOTP guard를 모두 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminConceptsController),
    ).toEqual([
      CognitoAuthorizerGuard,
      ApplicationRoleGuard,
      AdminMfaGuard,
    ]);
  });
});
