/** 콘텐츠 제작 DynamicModule의 application service와 관리자 guard 조립을 검증한다 */
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { ContentProductionController } from './content-production.controller.js';
import { ContentProductionModule } from './content-production.module.js';
import { ContentProductionApplicationService } from './content-production.service.js';
import { QuestionCandidateController } from './question-production.controller.js';
import { QuestionCandidateApplicationService } from './question-production.service.js';

describe('ContentProductionModule', () => {
  it('콘텐츠 제작 service와 ADMIN MFA guard 의존성을 독립 조립한다', () => {
    const users = {};
    const authorizer = {
      authMode: 'fake' as const,
      cognitoClientId: 'local-client',
      nodeEnv: 'test' as const,
    };
    const module = ContentProductionModule.register({
      uploads: {} as never,
      uploadPolicies: {} as never,
      presets: {} as never,
      contentProduction: {} as never,
      questionCandidates: {} as never,
      questionCandidateReview: {} as never,
      users: users as never,
      authorizer,
    });

    expect(module.controllers).toEqual([
      ContentProductionController,
      QuestionCandidateController,
    ]);
    const service = module.providers?.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === ContentProductionApplicationService,
    );
    expect(service).toMatchObject({
      provide: ContentProductionApplicationService,
    });
    expect(
      typeof service === 'object' && service !== null && 'useValue' in service
        ? service.useValue
        : null,
    ).toBeInstanceOf(ContentProductionApplicationService);
    expect(module.providers).toEqual(
      expect.arrayContaining([
        { provide: IDENTITY_USER_REPOSITORY, useValue: users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ]),
    );
    expect(module.exports).toEqual([ContentProductionApplicationService]);
    const candidateProvider = module.providers?.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === QuestionCandidateApplicationService,
    );
    expect(candidateProvider).toHaveProperty(
      'useValue',
      expect.any(QuestionCandidateApplicationService),
    );
  });
});
