/** TTS 운영 HTTP와 선택적인 local media 읽기 경계를 기능 단위로 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IdentityUserRepository } from '@flex-thia/domain';
import type { MediaReadUrlProvider } from '@flex-thia/domain';
import {
  LocalFileMediaReadProvider,
  LocalFileUploadProvider,
} from '@flex-thia/providers';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { LocalMediaController } from './local-media.controller.js';
import { LocalUploadController } from './local-upload.controller.js';
import { TtsOperationsController } from './tts-operations.controller.js';
import {
  TtsOperationsService,
  type TtsOperationsQueryPort,
  type TtsRetryCoordinator,
} from './tts-operations.service.js';
import { TtsVoicePresetsController } from './tts-voice-presets.controller.js';
import {
  TtsVoicePresetsService,
  type TtsVoicePresetQueryPort,
  type TtsVoicePresetRepositoryPort,
} from './tts-voice-presets.service.js';

/** root application이 mode별 media adapter를 주입하는 옵션 */
export interface MediaModuleOptions {
  query: TtsOperationsQueryPort;
  retryCoordinator: TtsRetryCoordinator;
  mediaReadUrls: MediaReadUrlProvider;
  voicePresets: {
    query: TtsVoicePresetQueryPort;
    repository: TtsVoicePresetRepositoryPort;
    activePresetId: string;
    generateId: () => string;
  };
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
  localMedia?: LocalFileMediaReadProvider;
  localUploads?: LocalFileUploadProvider;
}

/** TTS 운영과 local-only media route를 소유하는 Nest module */
@Module({})
export class MediaModule {
  /** production에는 ADMIN route만, local에는 HMAC reader를 함께 등록한다 */
  static register(options: MediaModuleOptions): DynamicModule {
    const localProviders = [
      ...(options.localMedia
        ? [
            {
              provide: LocalFileMediaReadProvider,
              useValue: options.localMedia,
            },
          ]
        : []),
      ...(options.localUploads
        ? [
            {
              provide: LocalFileUploadProvider,
              useValue: options.localUploads,
            },
          ]
        : []),
    ];
    return {
      module: MediaModule,
      controllers: [
        TtsOperationsController,
        TtsVoicePresetsController,
        ...(options.localMedia ? [LocalMediaController] : []),
        ...(options.localUploads ? [LocalUploadController] : []),
      ],
      providers: [
        {
          provide: TtsOperationsService,
          useValue: new TtsOperationsService({
            query: options.query,
            retryCoordinator: options.retryCoordinator,
            mediaReadUrls: options.mediaReadUrls,
          }),
        },
        {
          provide: TtsVoicePresetsService,
          useValue: new TtsVoicePresetsService(options.voicePresets),
        },
        ...localProviders,
        { provide: IDENTITY_USER_REPOSITORY, useValue: options.users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: options.authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ],
      exports: [TtsOperationsService, TtsVoicePresetsService],
    };
  }
}
