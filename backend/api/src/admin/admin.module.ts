/** 관리자 use case·read model과 인증 guard를 네 HTTP Controller에 조립한다 */
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
import { AdminContentImportsController } from './admin-content-imports.controller.js';
import {
  AdminContentService,
  type AdminContentDependencies,
} from './admin-content.service.js';
import { AdminMediaAssetsController } from './admin-media-assets.controller.js';
import { AdminQuestionsController } from './admin-questions.controller.js';
import { AdminVocabulariesController } from './admin-vocabularies.controller.js';

/** Admin HTTP 경계가 받는 기존 Stage 3~8 조립 결과와 인증 의존성 */
export interface AdminModuleOptions extends AdminContentDependencies {
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}

/** 관리자 콘텐츠 21개 operation과 strict 공개 facade를 제공한다 */
@Module({})
export class AdminModule {
  /** 선택된 repository·query·provider를 하나의 관리자 facade로 연결한다 */
  static register(options: AdminModuleOptions): DynamicModule {
    return {
      module: AdminModule,
      controllers: [
        AdminContentImportsController,
        AdminMediaAssetsController,
        AdminQuestionsController,
        AdminVocabulariesController,
      ],
      providers: [
        {
          provide: AdminContentService,
          useValue: new AdminContentService(options),
        },
        {
          provide: IDENTITY_USER_REPOSITORY,
          useValue: options.users,
        },
        {
          provide: AUTHORIZER_GUARD_OPTIONS,
          useValue: options.authorizer,
        },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ],
      exports: [AdminContentService],
    };
  }
}
