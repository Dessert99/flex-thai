/** 단어 연습 use case·media signer·인증 guard를 독립 Nest module로 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  IdentityUserRepository,
  MediaReadUrlProvider,
  VocabularyPracticeService,
} from '@flex-thia/domain';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { LearnerVocabularyPracticeController } from './learner-vocabulary-practice.controller.js';
import { LearnerVocabularyPracticeService } from './learner-vocabulary-practice.service.js';

/** 단어 연습 HTTP 조립 시 이미 선택된 use case와 adapter */
export interface VocabularyPracticeModuleOptions {
  practice: VocabularyPracticeService;
  mediaReadUrls: MediaReadUrlProvider;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}

/** 단어 연습 Controller와 공개 response mapper를 제공한다 */
@Module({})
export class VocabularyPracticeModule {
  /** application root가 넘긴 단어 연습 의존성을 기능 module에 고정한다 */
  static register(options: VocabularyPracticeModuleOptions): DynamicModule {
    return {
      module: VocabularyPracticeModule,
      controllers: [LearnerVocabularyPracticeController],
      providers: [
        {
          provide: LearnerVocabularyPracticeService,
          useValue: new LearnerVocabularyPracticeService({
            practice: options.practice,
            mediaReadUrls: options.mediaReadUrls,
          }),
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
      ],
      exports: [LearnerVocabularyPracticeService],
    };
  }
}
