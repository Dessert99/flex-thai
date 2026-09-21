/** 단어 추출·지시문·파일 업로드를 관리자 인증 경계에 연결한다. */
import { DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IdentityUserRepository } from '@flex-thia/domain/identity/user.repository';
import type { ExtractionTemplateRepository } from '@flex-thia/domain/vocabulary-extraction/extraction-template.repository';
import type { UploadPolicyService } from '@flex-thia/domain/uploads/upload-policy.service';
import {
  ExtractionController,
  EXTRACTION_OPTIONS,
  type ExtractionOptions,
} from './extraction.controller.js';
import {
  ExtractionTemplatesController,
  EXTRACTION_TEMPLATE_REPOSITORY,
} from './extraction-templates.controller.js';
import {
  ExtractionUploadsController,
  EXTRACTION_UPLOAD_POLICIES,
} from './extraction-uploads.controller.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
export interface VocabularyExtractionModuleOptions {
  extraction: ExtractionOptions;
  extractionTemplates: ExtractionTemplateRepository;
  uploadPolicies: UploadPolicyService;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}
@Module({})
export class VocabularyExtractionModule {
  static register(options: VocabularyExtractionModuleOptions): DynamicModule {
    return {
      module: VocabularyExtractionModule,
      controllers: [
        ExtractionController,
        ExtractionTemplatesController,
        ExtractionUploadsController,
      ],
      providers: [
        { provide: EXTRACTION_OPTIONS, useValue: options.extraction },
        {
          provide: EXTRACTION_TEMPLATE_REPOSITORY,
          useValue: options.extractionTemplates,
        },
        {
          provide: EXTRACTION_UPLOAD_POLICIES,
          useValue: options.uploadPolicies,
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
