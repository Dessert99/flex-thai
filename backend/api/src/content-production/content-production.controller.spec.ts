/** 콘텐츠 제작 Controller의 ADMIN+MFA 보안과 공개 projection을 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { ContentProductionDomainError } from '@flex-thia/domain';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { ContentProductionController } from './content-production.controller.js';

const user = {
  userId: '8f47b4d5-97d6-4596-af72-16456be51be8',
  sub: 'subject-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  mfaEnrolledAt: new Date(),
} as const;

const readHttpCode = (method: keyof ContentProductionController) => {
  const handler = Object.getOwnPropertyDescriptor(
    ContentProductionController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
};

describe('ContentProductionController 공개 경계', () => {
  it('admin/content-production 아래 모든 route에 Bearer·ADMIN·MFA를 고정한다', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, ContentProductionController),
    ).toBe('admin/content-production');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ContentProductionController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, ContentProductionController),
    ).toBe('ADMIN');
    expect(readHttpCode('createJob')).toBe(202);
    expect(readHttpCode('retryJob')).toBe(202);
  });

  it('작업 상세에서 input key와 내부 result를 공개하지 않는다', async () => {
    const getJob = vi.fn().mockResolvedValue({
      id: '405986f9-e552-4ce1-82d6-70a1fc460f96',
      requestedBy: user.userId,
      clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
      purpose: 'VOCABULARY_EXTRACTION',
      presetSnapshot: {
        id: 'a9979e5d-515d-43ab-a380-e88b78513c38',
        name: '기본 어휘 추출',
        purpose: 'VOCABULARY_EXTRACTION',
        version: 1,
        parameters: { language: 'th' },
      },
      inputs: [
        {
          uploadId: '77a1e8ff-7c85-4739-9004-647e12e34b65',
          inputType: 'PDF',
          inputKey: 'inputs/private.pdf',
          sizeBytes: 1024,
        },
      ],
      status: 'COMPLETED_WITH_FAILURES',
      attempt: 0,
      enqueuedAt: new Date('2026-07-27T00:00:01.000Z'),
      completedAt: new Date('2026-07-27T00:01:00.000Z'),
      counts: { total: 1, succeeded: 0, needsAttention: 0, failed: 1 },
      items: [
        {
          id: 'cbb22737-6f3d-4112-bb0e-8e4f005c810b',
          sourceRef: 'input:0',
          status: 'FAILED',
          attempt: 0,
          retryable: true,
          errorCode: 'LOCAL_FAKE_FAILURE',
          result: { providerRaw: 'secret' },
        },
      ],
      createdAt: new Date('2026-07-27T00:00:00.000Z'),
    });
    const controller = new ContentProductionController({
      getJob,
    } as never);

    const response = await controller.getJob(user, {
      jobId: '405986f9-e552-4ce1-82d6-70a1fc460f96',
    });

    expect(JSON.stringify(response)).not.toContain('inputKey');
    expect(JSON.stringify(response)).not.toContain('sourceRef');
    expect(JSON.stringify(response)).not.toContain('providerRaw');
  });

  it('멱등 body 충돌을 stable 409 응답 오류로 바꾼다', async () => {
    const controller = new ContentProductionController({
      create: vi
        .fn()
        .mockRejectedValue(
          new ContentProductionDomainError('IDEMPOTENCY_CONFLICT'),
        ),
    } as never);

    const error = await controller
      .createJob(user, {
        clientRequestId: 'dbb22737-6f3d-4112-bb0e-8e4f005c810b',
        purpose: 'QUESTION_GENERATION',
        presetId: 'a9979e5d-515d-43ab-a380-e88b78513c38',
        uploadIds: ['77a1e8ff-7c85-4739-9004-647e12e34b65'],
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_CONFLICT' },
    });
  });
});
