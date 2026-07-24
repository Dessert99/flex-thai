/** AdminModule이 4개 Controller와 하나의 strict facade·guard를 조립하는지 검증한다 */
import type { Provider, ValueProvider } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { AdminContentImportsController } from './admin-content-imports.controller.js';
import { AdminContentService } from './admin-content.service.js';
import { AdminMediaAssetsController } from './admin-media-assets.controller.js';
import { AdminQuestionsController } from './admin-questions.controller.js';
import { AdminVocabulariesController } from './admin-vocabularies.controller.js';
import { AdminModule } from './admin.module.js';

describe('AdminModule 조립', () => {
  it('관리자 Controller 네 개와 facade·세 guard를 등록한다', () => {
    const module = AdminModule.register({
      contentImports: {} as never,
      contentImportQuery: {} as never,
      media: {} as never,
      mediaQuery: {} as never,
      questions: {} as never,
      questionPublication: {} as never,
      questionQuery: {} as never,
      vocabularies: {} as never,
      vocabularyQuery: {} as never,
      findQuestionIdByVersionId: () => Promise.resolve(null),
      users: {} as never,
      authorizer: {
        authMode: 'fake',
        cognitoClientId: 'local-client',
        nodeEnv: 'test',
      },
    });

    expect(module.controllers).toEqual([
      AdminContentImportsController,
      AdminMediaAssetsController,
      AdminQuestionsController,
      AdminVocabulariesController,
    ]);
    const providers = module.providers ?? [];
    const values = providers.filter(
      (provider: Provider): provider is ValueProvider<unknown> =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        'useValue' in provider,
    );
    expect(
      values.find(({ provide }) => provide === AdminContentService)?.useValue,
    ).toBeInstanceOf(AdminContentService);
    expect(
      values.find(({ provide }) => provide === IDENTITY_USER_REPOSITORY),
    ).toBeDefined();
    expect(
      values.find(({ provide }) => provide === AUTHORIZER_GUARD_OPTIONS),
    ).toBeDefined();
    expect(providers).toContain(Reflector);
    expect(providers).toContain(CognitoAuthorizerGuard);
    expect(providers).toContain(ApplicationRoleGuard);
    expect(providers).toContain(AdminMfaGuard);
    expect(module.exports).toEqual([AdminContentService]);
  });
});
