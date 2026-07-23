/** 환경별 Identity use case와 HTTP Controller·guard를 조립한다 */
import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IdentityAuthenticationService,
  type IdentityUserRepository,
} from '@flex-thia/domain';
import { AdminMfaGuard } from './admin-mfa.guard.js';
import { ApplicationRoleGuard } from './application-role.guard.js';
import {
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
} from './cognito-authorizer.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { IdentityController } from './identity.controller.js';
import { MeController } from './me.controller.js';

/** Identity HTTP 경계를 구성하는 실행 환경 의존성 */
export interface IdentityModuleOptions {
  identity: IdentityAuthenticationService;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
  allowedOrigins: string[];
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
        Reflector,
        {
          provide: IdentityAuthenticationService,
          useValue: options.identity,
        },
        {
          provide: CognitoAuthorizerGuard,
          useValue: new CognitoAuthorizerGuard(
            options.users,
            options.authorizer,
          ),
        },
        {
          provide: CsrfGuard,
          useValue: new CsrfGuard(options.allowedOrigins),
        },
        ApplicationRoleGuard,
        AdminMfaGuard,
      ],
      exports: [
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        AdminMfaGuard,
        CsrfGuard,
      ],
    };
  }
}
