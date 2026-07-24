/** 관리자 media Controller의 guard·status·요청 문맥 전달을 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { MediaAdminService } from '@flex-thia/domain';
import {
  buildErrorResponse,
  DomainExceptionFilter,
} from '../common/errors/domain-exception.filter.js';
import { resolveAdminRequestId } from '../common/http/admin-request-id.js';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
import { AdminContentService } from './admin-content.service.js';
import { AdminMediaAssetsController } from './admin-media-assets.controller.js';

const mediaAssetId = '00000000-0000-4000-8000-000000000001';
const user = {
  userId: 'user-1',
  sub: 'subject-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  mfaEnrolledAt: new Date(),
} as const;

const readHttpCode = (method: keyof AdminMediaAssetsController) => {
  const handler = Object.getOwnPropertyDescriptor(
    AdminMediaAssetsController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
};

describe('AdminMediaAssetsController 공개 경계', () => {
  it('Bearer·ADMIN·MFA guard와 upload 생성 201을 고정한다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminMediaAssetsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLE_KEY, AdminMediaAssetsController),
    ).toBe('ADMIN');
    expect(readHttpCode('requestAudioUpload')).toBe(201);
    expect(readHttpCode('completeMediaAsset')).toBe(200);
  });

  it('body와 path를 parse하고 userId·sub·requestId를 전달한다', async () => {
    const service = {
      requestAudioUpload: vi.fn().mockResolvedValue({
        mediaAssetId,
        status: 'READY',
        uploadRequired: false,
        reused: true,
      }),
      completeMediaAsset: vi.fn().mockResolvedValue({
        mediaAssetId,
        status: 'READY',
        readyAt: '2026-07-24T00:00:00.000Z',
      }),
      getMediaAsset: vi.fn().mockResolvedValue({
        id: mediaAssetId,
        kind: 'AUDIO',
        declaredMimeType: 'audio/mpeg',
        declaredSizeBytes: 10,
        declaredSha256: 'a'.repeat(64),
        status: 'UPLOADING',
        mimeType: null,
        sizeBytes: null,
        sha256: null,
        readyAt: null,
        createdAt: '2026-07-24T00:00:00.000Z',
        usage: {
          pronunciations: { count: 0, ids: [] },
          sentences: { count: 0, ids: [] },
        },
      }),
    };
    const controller = new AdminMediaAssetsController(service as never);
    const body = {
      filename: 'voice.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
    } as const;

    await controller.requestAudioUpload(user, 'request-1', body);
    await controller.completeMediaAsset(user, 'request-1', { mediaAssetId });
    await controller.getMediaAsset({ mediaAssetId });

    const actor = {
      userId: 'user-1',
      sub: 'subject-1',
      requestId: 'request-1',
    };
    expect(service.requestAudioUpload).toHaveBeenCalledWith(actor, body);
    expect(service.completeMediaAsset).toHaveBeenCalledWith(
      actor,
      mediaAssetId,
    );
    expect(service.getMediaAsset).toHaveBeenCalledWith(mediaAssetId);
  });

  it('25MiB를 넘는 숫자 sizeBytes만 stable 413으로 변환한다', async () => {
    const controller = new AdminMediaAssetsController({} as never);
    const request = {
      filename: 'voice.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 25 * 1024 * 1024 + 1,
      sha256: 'a'.repeat(64),
    };

    const error = await controller
      .requestAudioUpload(user, 'request-large', request)
      .catch((caught: unknown) => caught);
    const type = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();

    new DomainExceptionFilter({ error: vi.fn() } as never).catch(error, {
      switchToHttp: () => ({
        getRequest: () => ({ adminRequestId: 'request-large', headers: {} }),
        getResponse: () => ({ type, status, json }),
      }),
    } as never);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'MEDIA_UPLOAD_TOO_LARGE',
        requestId: 'request-large',
      }),
    );
  });

  it('sizeBytes의 다른 strict 계약 실패는 400을 유지한다', async () => {
    const controller = new AdminMediaAssetsController({} as never);

    const error = await controller
      .requestAudioUpload(user, 'request-invalid', {
        filename: 'voice.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: '26214401',
        sha256: 'a'.repeat(64),
      })
      .catch((caught: unknown) => caught);

    expect(buildErrorResponse(error, 'request-invalid')).toMatchObject({
      status: 400,
      body: { code: 'INVALID_REQUEST', requestId: 'request-invalid' },
    });
  });

  it('REJECTED audit 뒤 오류 응답까지 요청 객체의 같은 ID를 보존한다', async () => {
    let finalizedContext: unknown;
    const media = new MediaAdminService(
      {
        findById: vi.fn().mockResolvedValue({
          id: mediaAssetId,
          kind: 'AUDIO',
          storageKey: `audio/${mediaAssetId}`,
          declaredMimeType: 'audio/mpeg',
          declaredSizeBytes: 10,
          declaredSha256: 'a'.repeat(64),
          mimeType: null,
          sizeBytes: null,
          sha256: null,
          status: 'UPLOADING',
          readyAt: null,
        }),
        finalizeWithAudit: vi
          .fn()
          .mockImplementation((input: { context: unknown }) => {
            finalizedContext = input.context;
            return Promise.resolve({
              outcome: 'REJECTED',
              asset: { id: mediaAssetId, status: 'REJECTED' },
            });
          }),
      } as never,
      {
        inspectAndSeal: vi.fn().mockResolvedValue({
          mimeType: 'audio/ogg',
          sizeBytes: 11,
          sha256: 'b'.repeat(64),
        }),
      } as never,
    );
    const controller = new AdminMediaAssetsController(
      new AdminContentService({ media } as never),
    );
    const request = {
      headers: { authorization: 'Bearer private-token' },
      body: { storageKey: 'private/audio.mp3' },
    };
    const requestId = resolveAdminRequestId(request);
    const error = await controller
      .completeMediaAsset(user, requestId, { mediaAssetId })
      .catch((caught: unknown) => caught);
    const type = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const errorLog = vi.fn();

    new DomainExceptionFilter({ error: errorLog } as never).catch(error, {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ type, status, json }),
      }),
    } as never);

    expect(finalizedContext).toMatchObject({ requestId });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'MEDIA_INSPECTION_MISMATCH',
        requestId,
      }),
    );
    expect(errorLog).not.toHaveBeenCalled();
    expect(JSON.stringify(json.mock.calls)).not.toContain('storageKey');
  });
});
