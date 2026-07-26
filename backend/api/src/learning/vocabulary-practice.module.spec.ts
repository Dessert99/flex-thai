/** 독립 단어 연습 module의 Controller·service·guard 조립을 검증한다 */
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { LearnerVocabularyPracticeController } from './learner-vocabulary-practice.controller.js';
import { LearnerVocabularyPracticeService } from './learner-vocabulary-practice.service.js';
import { VocabularyPracticeModule } from './vocabulary-practice.module.js';

describe('VocabularyPracticeModule 조립', () => {
  it('Controller·service·인증 guard 의존성을 독립 등록한다', () => {
    const options = {
      practice: {} as never,
      mediaReadUrls: {} as never,
      users: {} as never,
      authorizer: {} as never,
    };
    const module = VocabularyPracticeModule.register(options);

    expect(module.controllers).toEqual([LearnerVocabularyPracticeController]);
    expect(module.exports).toEqual([LearnerVocabularyPracticeService]);
    expect(module.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: LearnerVocabularyPracticeService,
          useValue: expect.any(LearnerVocabularyPracticeService),
        }),
        { provide: IDENTITY_USER_REPOSITORY, useValue: options.users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: options.authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
      ]),
    );
  });
});
