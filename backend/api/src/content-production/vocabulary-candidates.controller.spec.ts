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
import { VocabularyCandidateController } from './vocabulary-candidates.controller.js';

const candidateId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const user = {
  userId: '00000000-0000-4000-8000-000000000003',
  sub: 'actor-sub',
  email: 'admin@example.com',
  role: 'ADMIN',
  mfaEnrolledAt: new Date('2026-07-31T00:00:00.000Z'),
} as const;

const metadata = (method: keyof VocabularyCandidateController) => {
  const handler = Object.getOwnPropertyDescriptor(
    VocabularyCandidateController.prototype,
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
    discard: vi.fn().mockResolvedValue({}),
  };
  return {
    controller: new VocabularyCandidateController(service as never),
    service,
  };
};

describe('VocabularyCandidateController 공개 경계', () => {
  it('네 route를 ADMIN과 MFA로 보호하고 HTTP method를 고정한다', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, VocabularyCandidateController),
    ).toBe('admin/content-production/vocabulary-candidates');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, VocabularyCandidateController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, VocabularyCandidateController),
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
      code: 200,
      method: RequestMethod.DELETE,
      path: ':candidateId',
    });
  });

  it('strict query·path·body를 검증하고 인증 actor만 service에 전달한다', async () => {
    const { controller, service } = createController();

    await controller.list({ page: '2', pageSize: '10' });
    await controller.approve(
      user,
      { candidateId },
      {
        action: 'LINK_EXISTING',
        expectedRevision: 3,
        requestId,
        vocabularyId: candidateId,
      },
    );

    expect(service.list).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
    expect(service.approve).toHaveBeenCalledWith(
      { userId: user.userId, sub: user.sub },
      candidateId,
      {
        action: 'LINK_EXISTING',
        expectedRevision: 3,
        requestId,
        vocabularyId: candidateId,
      },
    );
  });

  it('잘못된 입력은 공통 filter에서 400 INVALID_REQUEST가 된다', async () => {
    const { controller } = createController();
    const error = await Promise.resolve()
      .then(() =>
        controller.discard(
          user,
          { candidateId: 'not-a-uuid' },
          { expectedRevision: -1, requestId: 'not-a-uuid' },
        ),
      )
      .catch((caught: unknown) => caught);

    expect(
      buildErrorResponse(error, '00000000-0000-4000-8000-000000000004'),
    ).toMatchObject({
      status: 400,
      body: { code: 'INVALID_REQUEST' },
    });
  });

  it.each([
    ['VOCABULARY_CANDIDATE_NOT_FOUND', 404],
    ['VOCABULARY_CANDIDATE_NOT_APPROVABLE', 400],
    ['VOCABULARY_CANDIDATE_AUDIO_NOT_READY', 400],
    ['VOCABULARY_CANDIDATE_REVIEW_CONFLICT', 409],
    ['VOCABULARY_CANDIDATE_IDEMPOTENCY_CONFLICT', 409],
  ] as const)('%s 오류를 stable %s 응답으로 바꾼다', async (code, status) => {
    const { controller, service } = createController();
    service.approve.mockRejectedValueOnce({ code });

    const error = await controller
      .approve(
        user,
        { candidateId },
        {
          action: 'LINK_EXISTING',
          expectedRevision: 0,
          requestId,
          vocabularyId: candidateId,
        },
      )
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status, response: { code } });
  });
});
