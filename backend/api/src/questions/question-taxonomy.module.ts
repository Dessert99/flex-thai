/** 문제 분류 query·command·guard를 독립 NestJS module로 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DrizzleQuestionTaxonomyQuery } from '@flex-thia/database';
import type {
  IdentityUserRepository,
  QuestionTaxonomyService,
} from '@flex-thia/domain';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { AdminQuestionTaxonomyController } from './admin-question-taxonomy.controller.js';
import { QuestionTaxonomyFacade } from './question-taxonomy.facade.js';

/** 문제 분류 HTTP module 조립 의존성 */
export interface QuestionTaxonomyModuleOptions {
  query: DrizzleQuestionTaxonomyQuery;
  service: QuestionTaxonomyService;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}

/** 관리자 문제 분류 설정 endpoint를 제공한다 */
@Module({})
export class QuestionTaxonomyModule {
  /** 선택한 adapter와 인증 의존성을 module-local facade에 연결한다 */
  static register(options: QuestionTaxonomyModuleOptions): DynamicModule {
    return {
      module: QuestionTaxonomyModule,
      controllers: [AdminQuestionTaxonomyController],
      providers: [
        {
          provide: QuestionTaxonomyFacade,
          useValue: new QuestionTaxonomyFacade(options),
        },
        { provide: IDENTITY_USER_REPOSITORY, useValue: options.users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: options.authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ],
      exports: [QuestionTaxonomyFacade],
    };
  }
}
