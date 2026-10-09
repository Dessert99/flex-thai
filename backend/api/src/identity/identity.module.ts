/** 환경별 Identity use case와 HTTP Controller·guard를 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityAuthenticationService } from '@flex-thia/domain/identity/authentication.service';
import { type IdentityUserRepository } from '@flex-thia/domain/identity/user.repository';
import { PasswordlessAuthenticationService } from '@flex-thia/domain/identity/passwordless-authentication.service';
import { ApplicationRoleGuard } from './application-role.guard.js';
import {
  AUTHORIZER_GUARD_OPTIONS,
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
  IDENTITY_USER_REPOSITORY,
} from './cognito-authorizer.guard.js';
import { CSRF_ALLOWED_ORIGINS, CsrfGuard } from './csrf.guard.js';
import { IdentityController } from './identity.controller.js';
import { MeController } from './me.controller.js';
import { LOCAL_AUTO_LOGIN, type LocalAutoLogin } from './local-auto-login.js';

/** Identity HTTP 경계를 구성하는 실행 환경 의존성 */
export interface IdentityModuleOptions {
  identity: IdentityAuthenticationService;
  passwordless: PasswordlessAuthenticationService;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
  allowedOrigins: string[];
  localAutoLogin?: LocalAutoLogin | undefined;
}

/** MVP 인증 endpoint와 보호 route용 guard를 제공한다 */
@Module({})
export class IdentityModule {
  /** 선택된 인증 adapter와 사용자 repository를 NestJS 경계에 연결한다 */
  static register(options: IdentityModuleOptions): DynamicModule {
    return {
      global: true,
      module: IdentityModule,
      controllers: [IdentityController, MeController],
      providers: [
        ...(options.localAutoLogin
          ? [{ provide: LOCAL_AUTO_LOGIN, useValue: options.localAutoLogin }]
          : []),
        Reflector,
        {
          provide: IdentityAuthenticationService,
          useValue: options.identity,
        },
        {
          provide: PasswordlessAuthenticationService,
          useValue: options.passwordless,
        },
        {
          provide: IDENTITY_USER_REPOSITORY,
          useValue: options.users,
        },
        {
          provide: AUTHORIZER_GUARD_OPTIONS,
          useValue: options.authorizer,
        },
        CognitoAuthorizerGuard,
        {
          provide: CSRF_ALLOWED_ORIGINS,
          useValue: options.allowedOrigins,
        },
        CsrfGuard,
        ApplicationRoleGuard,
      ],
      exports: [CognitoAuthorizerGuard, ApplicationRoleGuard, CsrfGuard],
    };
  }
}
