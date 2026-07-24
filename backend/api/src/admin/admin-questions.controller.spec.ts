/** 관리자 문제 Controller의 guard·status·모든 command 문맥 전달을 검증한다 */
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

const questionId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const user = {
  userId: 'user-1',
  sub: 'subject-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  mfaEnrolledAt: new Date(),
} as const;

const readHttpCode = (method: keyof AdminQuestionsController) => {
  const handler = Object.getOwnPropertyDescriptor(
    AdminQuestionsController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
};

const service = () => ({
  listQuestions: vi.fn().mockResolvedValue({
    items: [],
    page: {
      page: 2,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
    },
  }),
  getQuestion: vi.fn().mockResolvedValue({}),
  cloneQuestionVersion: vi.fn().mockResolvedValue({
    questionId,
    versionId,
    version: 2,
    status: 'DRAFT',
    validationStatus: 'PENDING',
  }),
  replaceQuestionVersion: vi.fn().mockResolvedValue({}),
  validateQuestionVersion: vi
    .fn()
    .mockResolvedValue({ status: 'PASSED', issues: [] }),
  publishQuestionVersion: vi.fn(),
  invalidateQuestionVersion: vi.fn(),
  hideQuestion: vi.fn(),
  restoreQuestion: vi.fn(),
});

describe('AdminQuestionsController 보호 경계', () => {
  it('Bearer·ADMIN·MFA guard와 생성·검증·command status를 고정한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminQuestionsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminQuestionsController),
    ).toBe('ADMIN');
    expect(readHttpCode('cloneQuestionVersion')).toBe(201);
    expect(readHttpCode('validateQuestionVersion')).toBe(200);
    expect(readHttpCode('publishQuestionVersion')).toBe(204);
    expect(readHttpCode('invalidateQuestionVersion')).toBe(204);
    expect(readHttpCode('hideQuestion')).toBe(204);
    expect(readHttpCode('restoreQuestion')).toBe(204);
  });

  it('목록 query와 상세·command UUID path를 parse한다', async () => {
    const fake = service();
    const controller = new AdminQuestionsController(fake as never);

    await controller.listQuestions({ difficulty: '3', page: '2' });
    await controller.cloneQuestionVersion(user, 'request-1', { questionId });
    await controller.validateQuestionVersion(user, 'request-1', { versionId });

    expect(fake.listQuestions).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: 3, page: 2, pageSize: 20 }),
    );
    await expect(
      controller.getQuestion({ questionId: 'invalid' }),
    ).rejects.toThrow();
    expect(fake.cloneQuestionVersion).toHaveBeenCalledWith(
      { userId: 'user-1', sub: 'subject-1', requestId: 'request-1' },
      questionId,
    );
    expect(fake.validateQuestionVersion).toHaveBeenCalledWith(
      { userId: 'user-1', sub: 'subject-1', requestId: 'request-1' },
      versionId,
    );
  });
});
