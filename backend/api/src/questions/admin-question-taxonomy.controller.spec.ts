/** 관리자 문제 분류 설정 controller 경계를 검증한다 */
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { AdminQuestionTaxonomyController } from './admin-question-taxonomy.controller.js';

describe('AdminQuestionTaxonomyController', () => {
  it('인증·ADMIN 역할·TOTP guard를 모두 요구한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminQuestionTaxonomyController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminQuestionTaxonomyController),
    ).toBe('ADMIN');
  });

  it('DRAFT·ACTIVE·RETIRED lifecycle route만 노출한다', () => {
    const metadata = (method: keyof AdminQuestionTaxonomyController) => {
      const handler = Object.getOwnPropertyDescriptor(
        AdminQuestionTaxonomyController.prototype,
        method,
      )?.value as object;
      return {
        method: Reflect.getMetadata(METHOD_METADATA, handler),
        path: Reflect.getMetadata(PATH_METADATA, handler),
      };
    };

    expect(metadata('settings')).toEqual({
      method: RequestMethod.GET,
      path: 'question-taxonomy',
    });
    expect(metadata('activateVersion').path).toBe(
      'question-type-versions/:versionId/activate',
    );
    expect(metadata('retireVersion').path).toBe(
      'question-type-versions/:versionId/retire',
    );
    expect(
      Object.getOwnPropertyNames(AdminQuestionTaxonomyController.prototype),
    ).not.toContain('discardVersion');
  });

  it('strict 유형 생성 payload를 facade로 전달한다', async () => {
    const facade = {
      createQuestionType: vi.fn().mockResolvedValue({}),
    };
    const controller = new AdminQuestionTaxonomyController(facade as never);

    await controller.createQuestionType({
      slug: 'reading-vocabulary',
      displayName: '어휘·문법',
      majorCategory: 'READING_VOCABULARY_GRAMMAR',
    });

    expect(facade.createQuestionType).toHaveBeenCalledWith({
      slug: 'reading-vocabulary',
      displayName: '어휘·문법',
      majorCategory: 'READING_VOCABULARY_GRAMMAR',
    });
    expect(() =>
      controller.createQuestionType({
        slug: 'Invalid Slug',
        displayName: '잘못된 유형',
        majorCategory: 'READING_VOCABULARY_GRAMMAR',
      }),
    ).toThrow();
  });
});
