/** 콘텐츠 오류 신고 learner/admin Controller와 guard를 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IdentityUserRepository } from '@flex-thia/domain';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { AdminContentErrorReportsController } from './admin-content-error-reports.controller.js';
import {
  ContentErrorReportHttpService,
  type ContentErrorReportHttpDependencies,
} from './content-error-report.service.js';
import { LearnerContentErrorReportsController } from './learner-content-error-reports.controller.js';

/** feedback module 조립 입력 */
export interface ContentErrorReportsModuleOptions extends ContentErrorReportHttpDependencies {
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}

/** 콘텐츠 오류 신고 HTTP facade를 독립 module로 제공한다 */
@Module({})
export class ContentErrorReportsModule {
  /** 선택된 use case·query·인증 의존성을 Controller에 연결한다 */
  static register(options: ContentErrorReportsModuleOptions): DynamicModule {
    return {
      module: ContentErrorReportsModule,
      controllers: [
        LearnerContentErrorReportsController,
        AdminContentErrorReportsController,
      ],
      providers: [
        {
          provide: ContentErrorReportHttpService,
          useValue: new ContentErrorReportHttpService(options),
        },
        { provide: IDENTITY_USER_REPOSITORY, useValue: options.users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: options.authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ],
      exports: [ContentErrorReportHttpService],
    };
  }
}
