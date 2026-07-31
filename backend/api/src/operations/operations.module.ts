/** 환경별 감사 기록 read use case와 HTTP Controller를 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuditLogService,
  type IdentityUserRepository,
} from '@flex-thia/domain';
import type { DrizzleAdminHomeQuery } from '@flex-thia/database';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { AdminAuditLogsController } from './admin-audit-logs.controller.js';
import { AdminHomeController } from './admin-home.controller.js';
import { AdminHomeService } from './admin-home.service.js';
import { AdminUsageCostOperationsController } from './admin-usage-cost-operations.controller.js';
import {
  UsageCostOperationsService,
  type UsageCostOperationsServiceDependencies,
} from './usage-cost-operations.service.js';

/** Operations HTTP 경계의 실행 환경 의존성 */
export interface OperationsModuleOptions {
  auditLogs: AuditLogService;
  homeQuery: DrizzleAdminHomeQuery;
  usageCost: UsageCostOperationsServiceDependencies;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}

/** 관리자 감사 기록 endpoint를 제공한다 */
@Module({})
export class OperationsModule {
  /** 선택된 감사 read use case를 NestJS 경계에 연결한다 */
  static register(options: OperationsModuleOptions): DynamicModule {
    const usageCost = new UsageCostOperationsService(options.usageCost);
    return {
      module: OperationsModule,
      controllers: [
        AdminAuditLogsController,
        AdminHomeController,
        AdminUsageCostOperationsController,
      ],
      providers: [
        { provide: AuditLogService, useValue: options.auditLogs },
        {
          provide: UsageCostOperationsService,
          useValue: usageCost,
        },
        {
          provide: AdminHomeService,
          useValue: new AdminHomeService({ query: options.homeQuery }),
        },
        { provide: IDENTITY_USER_REPOSITORY, useValue: options.users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: options.authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ],
    };
  }
}
