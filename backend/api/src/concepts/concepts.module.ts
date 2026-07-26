/** 개념 query·command·guard를 독립 NestJS module로 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  DrizzleAdminConceptQuery,
  DrizzleLearnerConceptQuery,
} from '@flex-thia/database';
import type {
  ConceptService,
  IdentityUserRepository,
  MediaReadUrlProvider,
} from '@flex-thia/domain';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { AdminConceptsController } from './admin-concepts.controller.js';
import { ConceptsService } from './concepts.service.js';
import { LearnerConceptsController } from './learner-concepts.controller.js';

/** 개념 HTTP module 조립 의존성 */
export interface ConceptsModuleOptions {
  learnerQuery: DrizzleLearnerConceptQuery;
  adminQuery: DrizzleAdminConceptQuery;
  adminService: ConceptService;
  mediaReadUrls: MediaReadUrlProvider;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}

/** 학습자·관리자 개념 endpoint를 제공한다 */
@Module({})
export class ConceptsModule {
  /** 선택한 adapter를 하나의 concept facade에 연결한다 */
  static register(options: ConceptsModuleOptions): DynamicModule {
    return {
      module: ConceptsModule,
      controllers: [LearnerConceptsController, AdminConceptsController],
      providers: [
        {
          provide: ConceptsService,
          useValue: new ConceptsService(options),
        },
        { provide: IDENTITY_USER_REPOSITORY, useValue: options.users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: options.authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ],
      exports: [ConceptsService],
    };
  }
}
