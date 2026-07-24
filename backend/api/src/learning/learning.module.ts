/** 학습 query·use case·media signer를 학습자 HTTP 경계에 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type DrizzleLearnerQuestionQuery,
  type DrizzleLearnerVocabularyQuery,
} from '@flex-thia/database';
import {
  type MediaReadUrlProvider,
  type QuestionAttemptService,
  type SavedContentService,
  type IdentityUserRepository,
} from '@flex-thia/domain';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { LearnerContentService } from './learner-content.service.js';
import { LearnerQuestionsController } from './learner-questions.controller.js';
import { LearnerVocabulariesController } from './learner-vocabularies.controller.js';

/** Learning HTTP 경계가 조립 시 받는 이미 선택된 adapter와 use case */
export interface LearningModuleOptions {
  questionQuery: DrizzleLearnerQuestionQuery;
  vocabularyQuery: DrizzleLearnerVocabularyQuery;
  questionAttempts: QuestionAttemptService;
  savedContent: SavedContentService;
  mediaReadUrls: MediaReadUrlProvider;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}

/** 학습자 문제·어휘 endpoint와 공개 response mapper를 제공한다 */
@Module({})
export class LearningModule {
  /** 하나의 application 조립 결과를 두 learner Controller가 공유하게 한다 */
  static register(options: LearningModuleOptions): DynamicModule {
    return {
      module: LearningModule,
      controllers: [LearnerQuestionsController, LearnerVocabulariesController],
      providers: [
        {
          provide: LearnerContentService,
          useValue: new LearnerContentService({
            questionQuery: options.questionQuery,
            vocabularyQuery: options.vocabularyQuery,
            questionAttempts: options.questionAttempts,
            savedContent: options.savedContent,
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
      exports: [LearnerContentService],
    };
  }
}
