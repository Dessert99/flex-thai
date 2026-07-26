/** 학습자 오류 신고 Controller의 인증과 위임을 검증한다 */
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { LearnerContentErrorReportsController } from './learner-content-error-reports.controller.js';

describe('LearnerContentErrorReportsController', () => {
  it('Cognito와 학습자 역할 guard를 요구한다', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        LearnerContentErrorReportsController,
      ),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard]);
  });

  it('생성 endpoint의 method·path·body·응답 문서를 연결한다', () => {
    const handler = Object.getOwnPropertyDescriptor(
      LearnerContentErrorReportsController.prototype,
      'create',
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'content-error-reports',
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toBeTruthy();
    expect(
      (
        Reflect.getMetadata('swagger/apiParameters', handler) as Array<{
          in: string;
        }>
      ).some((item) => item.in === 'body'),
    ).toBe(true);
    expect(Reflect.getMetadata('swagger/apiResponse', handler)).toBeTruthy();
  });
});
