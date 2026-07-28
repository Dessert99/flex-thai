/** TTS 운영 HTTP와 선택적인 local media 읽기 경계를 기능 단위로 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IdentityUserRepository } from '@flex-thia/domain';
import { LocalFileMediaReadProvider } from '@flex-thia/providers';
import { AdminMfaGuard } from '../identity/admin-mfa.guard.js';
import { ApplicationRoleGuard } from '../identity/application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from '../identity/cognito-authorizer.guard.js';
import { LocalMediaController } from './local-media.controller.js';
import { TtsOperationsController } from './tts-operations.controller.js';
import {
  TtsOperationsService,
  type TtsOperationsQueryPort,
  type TtsRetryCoordinator,
} from './tts-operations.service.js';

/** root application이 mode별 media adapter를 주입하는 옵션 */
export interface MediaModuleOptions {
  query: TtsOperationsQueryPort;
  retryCoordinator: TtsRetryCoordinator;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
  localMedia?: LocalFileMediaReadProvider;
}

/** TTS 운영과 local-only media route를 소유하는 Nest module */
@Module({})
export class MediaModule {
  /** production에는 ADMIN route만, local에는 HMAC reader를 함께 등록한다 */
  static register(options: MediaModuleOptions): DynamicModule {
    const localProviders = options.localMedia
      ? [
          {
            provide: LocalFileMediaReadProvider,
            useValue: options.localMedia,
          },
        ]
      : [];
    return {
      module: MediaModule,
      controllers: [
        TtsOperationsController,
        ...(options.localMedia ? [LocalMediaController] : []),
      ],
      providers: [
        {
          provide: TtsOperationsService,
          useValue: new TtsOperationsService({
            query: options.query,
            retryCoordinator: options.retryCoordinator,
          }),
        },
        ...localProviders,
        { provide: IDENTITY_USER_REPOSITORY, useValue: options.users },
        { provide: AUTHORIZER_GUARD_OPTIONS, useValue: options.authorizer },
        Reflector,
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
      ],
      exports: [TtsOperationsService],
    };
  }
}
