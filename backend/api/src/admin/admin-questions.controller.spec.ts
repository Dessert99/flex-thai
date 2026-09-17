import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { AdminQuestionsController } from './admin-questions.controller.js';
describe('문제 관리 HTTP 보호 경계', () => {
  it('인증·관리자·MFA 보호를 유지한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminQuestionsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminQuestionsController),
    ).toBe('ADMIN');
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        Object.getOwnPropertyDescriptor(
          AdminQuestionsController.prototype,
          'changeQuestionStatus',
        )?.value as object,
      ),
    ).toBe(204);
  });
  it('목록의 숫자 query를 검증하고 잘못된 문제 ID를 거부한다', async () => {
    const service = { listQuestions: vi.fn() };
    const controller = new AdminQuestionsController(service as never);
    await controller.listQuestions({ page: '2', difficulty: '3' });
    expect(service.listQuestions).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      difficulty: 3,
    });
    expect(() => controller.getQuestion({ questionId: 'invalid' })).toThrow();
  });
});
