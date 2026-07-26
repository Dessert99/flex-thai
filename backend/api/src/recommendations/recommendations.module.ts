/** 추천 query와 학습자 guard를 독립 NestJS module로 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DrizzleRecommendationQuery } from '@flex-thia/database';
import type { IdentityUserRepository } from '@flex-thia/domain';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { LearnerRecommendationsController } from './learner-recommendations.controller.js';
import { RecommendationsService } from './recommendations.service.js';

/** 추천 HTTP module 조립 의존성 */
export interface RecommendationsModuleOptions {
  query: DrizzleRecommendationQuery;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}

/** 인증된 학습자의 개인 추천 endpoint를 제공한다 */
@Module({})
export class RecommendationsModule {
  /** 선택된 read adapter를 strict 추천 facade에 연결한다 */
  static register(options: RecommendationsModuleOptions): DynamicModule {
    return {
      module: RecommendationsModule,
      controllers: [LearnerRecommendationsController],
      providers: [
        {
          provide: RecommendationsService,
          useValue: new RecommendationsService(options.query),
        },
        { provide: IDENTITY_USER_REPOSITORY, useValue: options.users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: options.authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
      ],
      exports: [RecommendationsService],
    };
  }
}
