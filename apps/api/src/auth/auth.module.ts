/** 환경별 identity·DB adapter와 인증 Controller·guard를 조립한다 */
import { DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type ChallengeCryptoPort,
  PasswordlessAuthService,
  StepUpService,
  type StepUpRepository,
  type UserRepository,
  type VerifiedPhoneProvider,
} from '@flex-thia/domain';
import { ApplicationRoleGuard } from './application-role.guard.js';
import { AuthController } from './auth.controller.js';
import {
  type AuthorizerGuardOptions,
  CognitoAuthorizerGuard,
} from './cognito-authorizer.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import {
  PhoneVerificationController,
  USER_REPOSITORY,
} from './phone-verification.controller.js';
import { RequireStepUpGuard } from './require-step-up.guard.js';
import {
  StepUpController,
  VERIFIED_PHONE_PROVIDER,
} from './step-up.controller.js';

/** local fake와 Cognito production 조립에 필요한 인증 옵션 */
export interface AuthModuleOptions {
  auth: PasswordlessAuthService;
  users: UserRepository;
  authorizer: AuthorizerGuardOptions;
  allowedOrigins: string[];
  stepUp: StepUpService;
  stepUpRepository: StepUpRepository;
  challengeCrypto: ChallengeCryptoPort;
  phone: VerifiedPhoneProvider;
}

/** 공개 인증 endpoint와 보호 route용 guard를 함께 제공한다 */
@Module({})
export class AuthModule {
  /** 실행 환경에서 선택한 adapter로 인증 경계를 구성한다 */
  static register(options: AuthModuleOptions): DynamicModule {
    return {
      global: true,
      module: AuthModule,
      controllers: [
        AuthController,
        StepUpController,
        PhoneVerificationController,
      ],
      providers: [
        Reflector,
        {
          provide: PasswordlessAuthService,
          useValue: options.auth,
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
        {
          provide: StepUpService,
          useValue: options.stepUp,
        },
        {
          provide: VERIFIED_PHONE_PROVIDER,
          useValue: options.phone,
        },
        {
          provide: USER_REPOSITORY,
          useValue: options.users,
        },
        {
          provide: RequireStepUpGuard,
          useValue: new RequireStepUpGuard(
            new Reflector(),
            options.stepUpRepository,
            options.challengeCrypto,
          ),
        },
        ApplicationRoleGuard,
      ],
      exports: [
        CognitoAuthorizerGuard,
        ApplicationRoleGuard,
        CsrfGuard,
        RequireStepUpGuard,
      ],
    };
  }
}
