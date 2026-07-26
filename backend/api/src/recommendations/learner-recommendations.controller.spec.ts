/** 학습자 추천 route·guard·사용자 전달 경계를 검증한다 */
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { LearnerRecommendationsController } from './learner-recommendations.controller.js';

describe('LearnerRecommendationsController', () => {
  it('학습자 guard와 GET /me/recommendations route를 고정한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LearnerRecommendationsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, LearnerRecommendationsController),
    ).toBe('LEARNER');
    const getForUser = Object.getOwnPropertyDescriptor(
      LearnerRecommendationsController.prototype,
      'getForUser',
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, getForUser)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, getForUser)).toBe(
      'me/recommendations',
    );
  });

  it('인증된 userId만 추천 service에 전달한다', async () => {
    const recommendations = {
      getForUser: vi.fn().mockResolvedValue({
        mode: 'FALLBACK',
        meaningfulSignalCount: 0,
        activationThreshold: 5,
        questions: [],
        vocabularies: [],
      }),
    };
    const controller = new LearnerRecommendationsController(
      recommendations as never,
    );

    await controller.getForUser({
      userId: '00000000-0000-4000-8000-000000000901',
      sub: 'learner-sub',
      email: 'learner@example.com',
      role: 'LEARNER',
      mfaEnrolledAt: null,
    });

    expect(recommendations.getForUser).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000901',
    );
  });
});
