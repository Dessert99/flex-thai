/** 학습자 오류 신고 Controller의 인증과 위임을 검증한다 */
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
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
});
