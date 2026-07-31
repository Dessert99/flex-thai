/** 콘텐츠 제작 adapter와 HTTP Controller를 기능 단위로 조립한다 */
import { DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  ContentProductionPresetCatalog,
  ContentProductionService,
  IdentityUserRepository,
  QuestionProductionContextRepository,
  UploadPolicyService,
  UploadRepository,
} from '@flex-thia/domain';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { ContentProductionController } from './content-production.controller.js';
import { ContentProductionApplicationService } from './content-production.service.js';
import { QuestionCandidateController } from './question-production.controller.js';
import {
  QuestionCandidateApplicationService,
  type QuestionCandidateReadRepository,
  type QuestionCandidateReviewOperations,
} from './question-production.service.js';
import { VocabularyCandidateController } from './vocabulary-candidates.controller.js';
import {
  VocabularyCandidateApplicationService,
  type VocabularyCandidateReviewOperations,
} from './vocabulary-candidates.service.js';
import type { VocabularyCandidateQuery } from '@flex-thia/domain';

/** 환경별 콘텐츠 제작 adapter를 주입하기 위한 module 옵션 */
export interface ContentProductionModuleOptions {
  uploads: UploadRepository;
  uploadPolicies: UploadPolicyService;
  presets: ContentProductionPresetCatalog;
  contentProduction: ContentProductionService;
  questionCandidates: QuestionCandidateReadRepository;
  questionCandidateReview: QuestionCandidateReviewOperations;
  vocabularyCandidates: VocabularyCandidateQuery;
  vocabularyCandidateReview: VocabularyCandidateReviewOperations;
  questionProductionContext?: QuestionProductionContextRepository;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}

/** root application이 한 번 등록할 콘텐츠 제작 기능 module */
@Module({})
export class ContentProductionModule {
  /** local fake와 production adapter를 같은 HTTP 경계에 연결한다 */
  static register(options: ContentProductionModuleOptions): DynamicModule {
    return {
      module: ContentProductionModule,
      controllers: [
        ContentProductionController,
        QuestionCandidateController,
        VocabularyCandidateController,
      ],
      providers: [
        {
          provide: ContentProductionApplicationService,
          useValue: new ContentProductionApplicationService(
            options.uploads,
            options.presets,
            options.contentProduction,
            options.uploadPolicies,
            options.questionProductionContext,
          ),
        },
        {
          provide: QuestionCandidateApplicationService,
          useValue: new QuestionCandidateApplicationService(
            options.questionCandidates,
            options.questionCandidateReview,
          ),
        },
        {
          provide: VocabularyCandidateApplicationService,
          useValue: new VocabularyCandidateApplicationService(
            options.vocabularyCandidates,
            options.vocabularyCandidateReview,
          ),
        },
        { provide: IDENTITY_USER_REPOSITORY, useValue: options.users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: options.authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ],
      exports: [ContentProductionApplicationService],
    };
  }
}
