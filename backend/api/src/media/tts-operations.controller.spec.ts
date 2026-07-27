/** TTS 운영 Controller의 ADMIN+MFA 보안·route·strict 입력을 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { TtsOperationsController } from './tts-operations.controller.js';

const ids = {
  job: '00000000-0000-4000-8000-000000000001',
  item: '00000000-0000-4000-8000-000000000002',
} as const;

const metadata = (method: keyof TtsOperationsController) => {
  const handler = Object.getOwnPropertyDescriptor(
    TtsOperationsController.prototype,
    method,
  )?.value as object;
  return {
    httpCode: Reflect.getMetadata(HTTP_CODE_METADATA, handler) as
      number | undefined,
    method: Reflect.getMetadata(METHOD_METADATA, handler) as
      RequestMethod | undefined,
    path: Reflect.getMetadata(PATH_METADATA, handler) as string | undefined,
  };
};

describe('TtsOperationsController 공개 경계', () => {
  it('admin/tts route 전체에 Bearer·ADMIN·MFA를 요구한다', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TtsOperationsController)).toBe(
      'admin/tts',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TtsOperationsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, TtsOperationsController),
    ).toBe('ADMIN');
  });

  it('목록·상세·일괄·개별 재시도 route와 202 상태를 고정한다', () => {
    expect(metadata('listJobs')).toMatchObject({
      method: RequestMethod.GET,
      path: 'jobs',
    });
    expect(metadata('getJob')).toMatchObject({
      method: RequestMethod.GET,
      path: 'jobs/:jobId',
    });
    expect(metadata('retryJob')).toEqual({
      method: RequestMethod.POST,
      path: 'jobs/:jobId/retry',
      httpCode: 202,
    });
    expect(metadata('retryItem')).toEqual({
      method: RequestMethod.POST,
      path: 'items/:itemId/retry',
      httpCode: 202,
    });
  });

  it('엄격히 파싱한 목록·상세 입력만 서비스에 전달한다', async () => {
    const service = {
      listJobs: vi.fn().mockResolvedValue({
        items: [],
        page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      }),
      getJob: vi.fn().mockResolvedValue({
        id: ids.job,
        status: 'SUCCEEDED',
        requestedBy: ids.job,
        counts: { pending: 0, processing: 0, succeeded: 1, failed: 0 },
        createdAt: '2026-07-27T00:00:00.000Z',
        startedAt: null,
        finishedAt: '2026-07-27T00:01:00.000Z',
        voice: {
          presetId: ids.job,
          provider: 'local',
          model: 'deterministic-v1',
          voice: 'thai-female',
          locale: 'th-TH',
          audioFormat: 'audio/wav',
          generationRevision: '2026-07-27',
        },
        items: [],
        itemPage: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      }),
    };
    const controller = new TtsOperationsController(service as never);

    await controller.listJobs({ page: '1', pageSize: '20' });
    await controller.getJob(
      { jobId: ids.job },
      { status: 'FAILED', page: '1' },
    );

    expect(service.listJobs).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
    expect(service.getJob).toHaveBeenCalledWith(ids.job, {
      status: 'FAILED',
      page: 1,
      pageSize: 20,
    });
    await expect(
      controller.listJobs({ page: '1', unknown: true }),
    ).rejects.toThrow();
  });

  it('일괄·개별 재시도는 경로와 본문을 조합해 접수 응답만 반환한다', async () => {
    const service = {
      retryJob: vi.fn().mockResolvedValue({
        jobId: ids.job,
        itemIds: [ids.item],
        retriedCount: 1,
      }),
      retryItem: vi.fn().mockResolvedValue({
        jobId: ids.job,
        itemIds: [ids.item],
        retriedCount: 1,
      }),
    };
    const controller = new TtsOperationsController(service as never);

    await expect(
      controller.retryJob(
        { jobId: ids.job },
        { items: [{ itemId: ids.item, expectedAttempt: 2 }] },
      ),
    ).resolves.toEqual({
      jobId: ids.job,
      itemIds: [ids.item],
      retriedCount: 1,
    });
    await expect(
      controller.retryItem(
        { itemId: ids.item },
        { jobId: ids.job, expectedAttempt: 2 },
      ),
    ).resolves.toEqual({
      jobId: ids.job,
      itemIds: [ids.item],
      retriedCount: 1,
    });
    expect(service.retryJob).toHaveBeenCalledWith(ids.job, [
      { itemId: ids.item, expectedAttempt: 2 },
    ]);
    expect(service.retryItem).toHaveBeenCalledWith(ids.item, {
      jobId: ids.job,
      expectedAttempt: 2,
    });
  });
});
