/** LearningModule이 Controller와 공개 mapper만 조립하는지 검증한다 */
import type { Provider, ValueProvider } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { LearnerContentService } from './learner-content.service.js';
import { LearnerQuestionsController } from './learner-questions.controller.js';
import { LearnerVocabulariesController } from './learner-vocabularies.controller.js';
import { LearningModule } from './learning.module.js';

describe('LearningModule', () => {
  it('두 learner Controller와 하나의 content service를 등록한다', () => {
    const module = LearningModule.register({
      questionQuery: {} as never,
      vocabularyQuery: {} as never,
      questionAttempts: {} as never,
      savedContent: {} as never,
      mediaReadUrls: { createReadUrl: vi.fn() },
      users: {} as never,
      authorizer: {
        authMode: 'fake',
        cognitoClientId: 'local-client',
        nodeEnv: 'test',
      },
    });

    expect(module.controllers).toEqual([
      LearnerQuestionsController,
      LearnerVocabulariesController,
    ]);
    const providers = module.providers ?? [];
    const valueProviders = providers.filter(
      (provider: Provider): provider is ValueProvider<unknown> =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        'useValue' in provider,
    );
    const content = valueProviders.find(
      (provider) => provider.provide === LearnerContentService,
    );
    const users = valueProviders.find(
      (provider) => provider.provide === IDENTITY_USER_REPOSITORY,
    );
    const authorizer = valueProviders.find(
      (provider) => provider.provide === AUTHORIZER_GUARD_OPTIONS,
    );

    expect(content?.useValue).toBeInstanceOf(LearnerContentService);
    expect(users?.useValue).toBeTypeOf('object');
    expect(authorizer?.useValue).toMatchObject({ authMode: 'fake' });
    expect(providers).toContain(Reflector);
    expect(providers).toContain(CognitoAuthorizerGuard);
    expect(providers).toContain(ApplicationRoleGuard);
    expect(module.exports).toEqual([LearnerContentService]);
  });
});
