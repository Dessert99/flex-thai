/** TTS 운영과 local media 읽기 Controller의 기능 module 조립을 검증한다 */
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { LocalMediaController } from './local-media.controller.js';
import { MediaModule } from './media.module.js';
import { TtsOperationsController } from './tts-operations.controller.js';
import { TtsOperationsService } from './tts-operations.service.js';
import { TtsVoicePresetsController } from './tts-voice-presets.controller.js';
import { TtsVoicePresetsService } from './tts-voice-presets.service.js';

const mediaDependencies = {
  mediaReadUrls: {} as never,
  voicePresets: {
    query: {} as never,
    repository: {} as never,
    activePresetId: '00000000-0000-4000-8000-000000000001',
    generateId: () => '00000000-0000-4000-8000-000000000002',
  },
};

describe('MediaModule', () => {
  it('production은 ADMIN+MFA TTS 운영 경계만 등록한다', () => {
    const users = {};
    const authorizer = {
      authMode: 'cognito' as const,
      cognitoClientId: 'client',
      nodeEnv: 'production' as const,
    };
    const module = MediaModule.register({
      query: {} as never,
      retryCoordinator: {} as never,
      ...mediaDependencies,
      users: users as never,
      authorizer,
    });

    expect(module.controllers).toEqual([
      TtsOperationsController,
      TtsVoicePresetsController,
    ]);
    expect(module.providers).toEqual(
      expect.arrayContaining([
        { provide: IDENTITY_USER_REPOSITORY, useValue: users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ]),
    );
    const serviceProvider = module.providers?.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === TtsOperationsService,
    );
    expect(serviceProvider).toHaveProperty(
      'useValue',
      expect.any(TtsOperationsService),
    );
    expect(module.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: TtsVoicePresetsService }),
      ]),
    );
  });

  it('local provider가 있을 때만 private 파일 읽기 Controller를 추가한다', () => {
    const module = MediaModule.register({
      query: {} as never,
      retryCoordinator: {} as never,
      ...mediaDependencies,
      users: {} as never,
      authorizer: {
        authMode: 'fake',
        cognitoClientId: 'local-client',
        nodeEnv: 'test',
      },
      localMedia: {} as never,
    });

    expect(module.controllers).toEqual([
      TtsOperationsController,
      TtsVoicePresetsController,
      LocalMediaController,
    ]);
  });
});
