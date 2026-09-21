import {
  ExtractionController,
  EXTRACTION_OPTIONS,
  type ExtractionOptions,
} from '../vocabulary-extraction/extraction.controller.js';
import type { ExtractionTemplateRepository } from '@flex-thia/domain/content-production/extraction-template.repository';
import {
  ExtractionTemplatesController,
  EXTRACTION_TEMPLATE_REPOSITORY,
} from './extraction-templates.controller.js';
/** 콘텐츠 제작 adapter와 HTTP Controller를 기능 단위로 조립한다 */
import { DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  ContentProductionPresetCatalog,
  ContentProductionService,
} from '@flex-thia/domain/content-production/content-production.service';
import type { IdentityUserRepository } from '@flex-thia/domain/identity/user.repository';

import type { UploadPolicyService } from '@flex-thia/domain/uploads/upload-policy.service';
import type { UploadRepository } from '@flex-thia/domain/uploads/upload.repository';
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

import { VocabularyCandidateController } from './vocabulary-candidates.controller.js';
import {
  VocabularyCandidateApplicationService,
  type VocabularyCandidateReviewOperations,
} from './vocabulary-candidates.service.js';
import type { VocabularyCandidateQuery } from '@flex-thia/domain/content-production/vocabulary-candidate-review';

/** 환경별 콘텐츠 제작 adapter를 주입하기 위한 module 옵션 */
export interface ContentProductionModuleOptions {
  extraction?: ExtractionOptions;
  extractionTemplates: ExtractionTemplateRepository;
  uploads: UploadRepository;
  uploadPolicies: UploadPolicyService;
  presets: ContentProductionPresetCatalog;
  contentProduction: ContentProductionService;
  vocabularyCandidates: VocabularyCandidateQuery;
  vocabularyCandidateReview: VocabularyCandidateReviewOperations;
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
        ...(options.extraction ? [ExtractionController] : []),
        ExtractionTemplatesController,
        ContentProductionController,
        VocabularyCandidateController,
      ],
      providers: [
        ...(options.extraction
          ? [{ provide: EXTRACTION_OPTIONS, useValue: options.extraction }]
          : []),
        {
          provide: EXTRACTION_TEMPLATE_REPOSITORY,
          useValue: options.extractionTemplates,
        },
        {
          provide: ContentProductionApplicationService,
          useValue: new ContentProductionApplicationService(
            options.uploads,
            options.presets,
            options.contentProduction,
            options.uploadPolicies,
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
