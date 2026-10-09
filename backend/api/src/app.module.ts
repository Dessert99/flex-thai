/** HTTP 기능 모듈을 하나의 NestJS 애플리케이션으로 조립한다 */
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client } from '@aws-sdk/client-sesv2';

import { readApiEnv } from '@flex-thia/config/api-env';
import { createDataApiDatabase } from '@flex-thia/database/clients/data-api';
import { createLocalDatabase } from '@flex-thia/database/clients/local';

import { DrizzleLearnerVocabularyQuery } from '@flex-thia/database/queries/drizzle-learner-vocabulary.query';

import { DrizzleWordbookQuery } from '@flex-thia/database/queries/drizzle-wordbook.query';

import { DrizzleEmailChallengeRepository } from '@flex-thia/database/repositories/drizzle-email-challenge.repository';

import { DrizzleReadinessProbe } from '@flex-thia/database/repositories/drizzle-readiness.probe';
import { DrizzleUserRepository } from '@flex-thia/database/repositories/drizzle-user.repository';
import { DrizzleWordbookRepository } from '@flex-thia/database/repositories/drizzle-wordbook.repository';

import { IdentityAuthenticationService } from '@flex-thia/domain/identity/authentication.service';
import { PasswordlessAuthenticationService } from '@flex-thia/domain/identity/passwordless-authentication.service';

import { WordbookService } from '@flex-thia/domain/learning/wordbook';

import { ChallengeCrypto } from '@flex-thia/providers/crypto/challenge-crypto';

import { FakeEmailChallengeSender } from '@flex-thia/providers/fakes/fake-email-challenge.sender';

import { CognitoPasswordlessAuthenticationProvider } from '@flex-thia/providers/identity/cognito-passwordless-authentication.provider';
import { FakePasswordlessAuthenticationProvider } from '@flex-thia/providers/identity/fake-passwordless-authentication.provider';
import { SesEmailChallengeSender } from '@flex-thia/providers/messaging/ses-email-challenge.sender';
import { type DynamicModule, Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import {
  ReadinessController,
  ReadinessService,
} from './health/readiness.service.js';
import { IdentityModule } from './identity/identity.module.js';
import { createLocalAutoLogin } from './identity/local-auto-login.js';
import { LearningModule } from './learning/learning.module.js';

/** 기초 API의 root module */
@Module({})
export class AppModule {}

class LocalChallengeCrypto extends ChallengeCrypto {
  /** 로컬 수동 테스트가 이메일 인프라 없이 고정 코드를 입력하도록 한다 */
  override createChallengeSecrets(): ReturnType<
    ChallengeCrypto['createChallengeSecrets']
  > {
    const generated = super.createChallengeSecrets();
    const code = '123456';

    return {
      ...generated,
      code,
      codeHmac: this.hashAnswer(code),
    };
  }
}

const requireValue = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`${name} 환경 변수가 필요합니다`);
  }

  return value;
};

/** 환경 설정에 맞는 DB와 AWS 또는 local adapter를 root module에 조립한다 */
export const createApplicationModule = (
  source: Record<string, string | undefined> = process.env,
): DynamicModule => {
  const env = readApiEnv(source);
  const database: ConstructorParameters<typeof DrizzleUserRepository>[0] =
    env.DATABASE_MODE === 'local'
      ? createLocalDatabase(env.DATABASE_URL)
      : createDataApiDatabase({
          region: env.AWS_REGION,
          database: env.DATABASE_NAME,
          resourceArn: requireValue(env.RDS_RESOURCE_ARN, 'RDS_RESOURCE_ARN'),
          secretArn: requireValue(env.RDS_SECRET_ARN, 'RDS_SECRET_ARN'),
        });
  const users = new DrizzleUserRepository(database);
  const fakeAuthenticationProvider =
    env.AUTH_MODE === 'fake'
      ? new FakePasswordlessAuthenticationProvider({
          mode: env.NODE_ENV === 'development' ? 'local' : env.NODE_ENV,
          accounts: [
            {
              email: env.FAKE_LEARNER_EMAIL,
              subject: env.FAKE_LEARNER_SUB,
              role: 'LEARNER',
            },
          ],
        })
      : undefined;
  const authenticationProvider =
    fakeAuthenticationProvider ??
    new CognitoPasswordlessAuthenticationProvider(
      new CognitoIdentityProviderClient({ region: env.AWS_REGION }),
      requireValue(env.COGNITO_USER_POOL_ID, 'COGNITO_USER_POOL_ID'),
      requireValue(env.COGNITO_CLIENT_ID, 'COGNITO_CLIENT_ID'),
      requireValue(env.CUSTOM_AUTH_SECRET, 'CUSTOM_AUTH_SECRET'),
    );
  const identity = new IdentityAuthenticationService(
    authenticationProvider,
    users,
  );
  const challengeCrypto =
    env.AUTH_MODE === 'fake'
      ? new LocalChallengeCrypto(env.CHALLENGE_HMAC_PEPPER)
      : new ChallengeCrypto(env.CHALLENGE_HMAC_PEPPER);
  const emailChallengeRepository = new DrizzleEmailChallengeRepository(
    database,
    challengeCrypto,
  );
  const emailChallengeSender =
    env.AUTH_MODE === 'fake'
      ? new FakeEmailChallengeSender()
      : new SesEmailChallengeSender(
          new SESv2Client({ region: env.AWS_REGION }),
          requireValue(env.FROM_EMAIL, 'FROM_EMAIL'),
        );
  const passwordless = new PasswordlessAuthenticationService(
    emailChallengeRepository,
    authenticationProvider,
    emailChallengeSender,
    challengeCrypto,
    env.EMAIL_LINK_CONFIRMATION_URL,
  );
  const authorizer = {
    authMode: env.AUTH_MODE,
    cognitoClientId: env.COGNITO_CLIENT_ID ?? 'local-client',
    nodeEnv: env.NODE_ENV,
    ...(fakeAuthenticationProvider
      ? {
          resolveFakeAccessTokenSubject: (accessToken: string) =>
            fakeAuthenticationProvider.resolveAccessTokenSubject(accessToken),
        }
      : {}),
  };
  return {
    module: AppModule,
    imports: [
      IdentityModule.register({
        identity,
        localAutoLogin: createLocalAutoLogin(
          env,
          fakeAuthenticationProvider,
          identity,
        ),
        passwordless,
        users,
        authorizer,
        allowedOrigins: env.ALLOWED_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      }),
      LearningModule.register({
        vocabularyQuery: new DrizzleLearnerVocabularyQuery(database),
        wordbookQuery: new DrizzleWordbookQuery(database),
        wordbooks: new WordbookService(new DrizzleWordbookRepository(database)),
        users,
        authorizer,
      }),
    ],
    controllers: [HealthController, ReadinessController],
    providers: [
      {
        provide: ReadinessService,
        useValue: new ReadinessService(new DrizzleReadinessProbe(database)),
      },
    ],
  };
};
