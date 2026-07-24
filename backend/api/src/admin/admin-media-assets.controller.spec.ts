/** 관리자 media Controller의 guard·status·요청 문맥 전달을 검증한다 */
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { REQUIRED_ROLE_KEY } from '../identity/require-role.decorator.js';
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
});
