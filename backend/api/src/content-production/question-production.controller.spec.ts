/** AI 문제 후보 Controller의 route·ADMIN+MFA·stable HTTP 오류 경계를 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { buildErrorResponse } from '../common/errors/domain-exception.filter.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { QuestionCandidateController } from './question-production.controller.js';
import { QuestionCandidateApplicationError } from './question-production.service.js';

const candidateId = '405986f9-e552-4ce1-82d6-70a1fc460f96';
const bodyRequestId = 'd9886994-5b49-46ac-bcd5-3f2024b9c1c6';
const metadataRequestId = '4d2b623e-4463-461e-90ce-62f9f2ee1c78';
const user = {
  userId: '8f47b4d5-97d6-4596-af72-16456be51be8',
  sub: 'cognito-subject',
  email: 'admin@example.com',
  role: 'ADMIN',
  mfaEnrolledAt: new Date('2026-07-27T00:00:00.000Z'),
} as const;

const metadata = (method: keyof QuestionCandidateController) => {
  const handler = Object.getOwnPropertyDescriptor(
    QuestionCandidateController.prototype,
    method,
  )?.value as object;
  return {
    code: Reflect.getMetadata(HTTP_CODE_METADATA, handler) as
      number | undefined,
    method: Reflect.getMetadata(METHOD_METADATA, handler) as
      RequestMethod | undefined,
    path: Reflect.getMetadata(PATH_METADATA, handler) as string | undefined,
  };
};

const createController = () => {
  const service = {
    list: vi.fn().mockResolvedValue({ items: [], page: {} }),
    get: vi.fn().mockResolvedValue({ candidate: {}, validations: [] }),
    approve: vi.fn().mockResolvedValue({}),
    discard: vi.fn().mockResolvedValue(undefined),
    regenerate: vi.fn().mockResolvedValue({}),
  };
  return {
    controller: new QuestionCandidateController(service as never),
    service,
  };
};

describe('QuestionCandidateController 공개 경계', () => {
  it('모든 route를 ADMIN과 MFA로 보호하고 상태 code를 고정한다', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, QuestionCandidateController),
    ).toBe('admin/content-production/question-candidates');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QuestionCandidateController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, QuestionCandidateController),
    ).toBe('ADMIN');
    expect(metadata('list')).toMatchObject({
      method: RequestMethod.GET,
      path: '/',
    });
    expect(metadata('get')).toMatchObject({
      method: RequestMethod.GET,
      path: ':candidateId',
    });
    expect(metadata('approve')).toMatchObject({
      code: 200,
      method: RequestMethod.POST,
      path: ':candidateId/approve',
    });
    expect(metadata('discard')).toMatchObject({
      code: 204,
      method: RequestMethod.DELETE,
      path: ':candidateId',
    });
    expect(metadata('regenerate')).toMatchObject({
      code: 202,
      method: RequestMethod.POST,
      path: ':candidateId/regenerate',
    });
  });

  it('strict query·path·body를 검증하고 인증 문맥만 service에 전달한다', async () => {
    const { controller, service } = createController();

    await controller.list({ page: '2', pageSize: '10' });
    await controller.approve(
      user,
      { candidateId },
      { expectedRevision: 3, requestId: bodyRequestId },
    );

    expect(service.list).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
    expect(service.approve).toHaveBeenCalledWith(
      {
        userId: user.userId,
        sub: user.sub,
      },
      candidateId,
      { expectedRevision: 3, requestId: bodyRequestId },
    );
  });

  it('잘못된 입력은 공통 filter에서 400 INVALID_REQUEST가 된다', async () => {
    const { controller } = createController();

    const error = await Promise.resolve()
      .then(() =>
        controller.approve(
          user,
          { candidateId: 'not-a-uuid' },
          { expectedRevision: -1, requestId: 'not-a-uuid' },
        ),
      )
      .catch((caught: unknown) => caught);

    expect(buildErrorResponse(error, metadataRequestId)).toMatchObject({
      status: 400,
      body: { code: 'INVALID_REQUEST' },
    });
  });

  it.each([
    [
      new QuestionCandidateApplicationError('QUESTION_CANDIDATE_NOT_FOUND'),
      404,
      'QUESTION_CANDIDATE_NOT_FOUND',
    ],
    [
      { code: 'QUESTION_CANDIDATE_NOT_APPROVABLE' },
      400,
      'QUESTION_CANDIDATE_NOT_APPROVABLE',
    ],
    [
      { code: 'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT' },
      409,
      'QUESTION_CANDIDATE_IDEMPOTENCY_CONFLICT',
    ],
    [
      { code: 'QUESTION_CANDIDATE_REVIEW_CONFLICT' },
      409,
      'QUESTION_CANDIDATE_REVIEW_CONFLICT',
    ],
  ] as const)(
    '기능 오류 %s를 stable %s 응답으로 바꾼다',
    async (failure, status, code) => {
      const { controller, service } = createController();
      service.approve.mockRejectedValueOnce(failure);

      const error = await controller
        .approve(
          user,
          { candidateId },
          { expectedRevision: 3, requestId: bodyRequestId },
        )
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({
        status,
        response: { code },
      });
    },
  );
});
