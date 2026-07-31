/** TTS voice preset Controller의 ADMIN+MFA route와 strict 입력을 검증한다 */
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import { CognitoAuthorizerGuard } from '../identity/cognito-authorizer.guard.js';
import { TtsVoicePresetsController } from './tts-voice-presets.controller.js';

const ids = {
  preset: '00000000-0000-4000-8000-000000000001',
  admin: '00000000-0000-4000-8000-000000000002',
  request: '00000000-0000-4000-8000-000000000003',
};
const user = { userId: ids.admin, sub: 'admin-sub' } as never;

const route = (method: keyof TtsVoicePresetsController) => {
  const handler = Object.getOwnPropertyDescriptor(
    TtsVoicePresetsController.prototype,
    method,
  )?.value as object;
  const requestMethod: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
  const path: unknown = Reflect.getMetadata(PATH_METADATA, handler);
  if (typeof requestMethod !== 'number' || typeof path !== 'string') {
    throw new Error('TTS_VOICE_PRESET_ROUTE_METADATA_REQUIRED');
  }
  return {
    method: requestMethod,
    path,
  };
};

describe('TtsVoicePresetsController', () => {
  it('admin/tts/presets 전체에 ADMIN+MFA guard를 적용한다', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TtsVoicePresetsController)).toBe(
      'admin/tts/presets',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TtsVoicePresetsController),
    ).toEqual([CognitoAuthorizerGuard, ApplicationRoleGuard, AdminMfaGuard]);
    expect(route('createVersion')).toEqual({
      method: RequestMethod.POST,
      path: ':presetId/versions',
    });
  });

  it('command에 user와 request ID를 body 밖에서 전달한다', async () => {
    const service = {
      disablePreset: vi.fn().mockResolvedValue({
        id: ids.preset,
        name: 'thai-default',
        provider: 'local',
        model: 'v1',
        voice: 'thai',
        locale: 'th-TH',
        audioFormat: 'audio/wav',
        generationRevision: 'v1',
        enabled: false,
        active: false,
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T01:00:00.000Z',
      }),
    };
    const controller = new TtsVoicePresetsController(service as never);

    await controller.disablePreset(
      user,
      ids.request,
      { presetId: ids.preset },
      { expectedUpdatedAt: '2026-07-28T00:00:00.000Z' },
    );

    expect(service.disablePreset).toHaveBeenCalledWith(
      { userId: ids.admin, sub: 'admin-sub', requestId: ids.request },
      ids.preset,
      { expectedUpdatedAt: '2026-07-28T00:00:00.000Z' },
    );
    expect(() =>
      controller.disablePreset(
        user,
        ids.request,
        { presetId: ids.preset },
        {
          expectedUpdatedAt: '2026-07-28T00:00:00.000Z',
          unknown: true,
        },
      ),
    ).toThrow();
  });
});
