/** OperationsModule의 Controller와 service 조립을 검증한다 */
import type { ValueProvider } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  AuditLogService,
  type IdentityUserRepository,
} from '@flex-thia/domain';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { AdminAuditLogsController } from './admin-audit-logs.controller.js';
import { OperationsModule } from './operations.module.js';

describe('OperationsModule', () => {
  it('감사 Controller와 read service 및 관리자 guard를 등록한다', () => {
    const auditLogs = {} as AuditLogService;
    const users = {} as IdentityUserRepository;
    const authorizer = {
      authMode: 'fake',
      cognitoClientId: 'local-client',
      nodeEnv: 'test',
    } satisfies AuthorizerGuardOptions;
    const module = OperationsModule.register({
      auditLogs,
      users,
      authorizer,
    });
    const providers = module.providers as ValueProvider[];

    expect(module.controllers).toEqual([AdminAuditLogsController]);
    expect(providers).toContainEqual({
      provide: AuditLogService,
      useValue: auditLogs,
    });
    expect(providers).toContainEqual({
      provide: IDENTITY_USER_REPOSITORY,
      useValue: users,
    });
    expect(providers).toContainEqual({
      provide: AUTHORIZER_GUARD_OPTIONS,
      useValue: authorizer,
    });
    expect(providers).toEqual(
      expect.arrayContaining([
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ]),
    );
  });
});
