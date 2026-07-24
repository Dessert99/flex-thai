/** HTTP 기능 모듈을 하나의 NestJS 애플리케이션으로 조립한다 */
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { type DynamicModule, Module } from '@nestjs/common';
import { readApiEnv } from '@flex-thia/config';
import {
  createDataApiDatabase,
  createLocalDatabase,
  DrizzleLearnerQuestionQuery,
  DrizzleLearnerVocabularyQuery,
  DrizzleLearningRepository,
  DrizzleReadinessProbe,
  DrizzleUserRepository,
} from '@flex-thia/database';
import {
  IdentityAuthenticationService,
  QuestionAttemptService,
  SavedContentService,
} from '@flex-thia/domain';
import {
  CloudFrontMediaReadUrlProvider,
  CognitoAuthenticationProvider,
  FakeAuthenticationProvider,
  FakeMediaReadUrlProvider,
} from '@flex-thia/providers';
import { HealthController } from './health/health.controller.js';
import {
  ReadinessController,
  ReadinessService,
} from './health/readiness.service.js';
import { IdentityModule } from './identity/identity.module.js';
import { LearningModule } from './learning/learning.module.js';

/** 기초 API의 root module */
@Module({})
export class AppModule {}

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
  const authenticationProvider =
    env.AUTH_MODE === 'cognito'
      ? new CognitoAuthenticationProvider(
          new CognitoIdentityProviderClient({ region: env.AWS_REGION }),
          requireValue(env.COGNITO_USER_POOL_ID, 'COGNITO_USER_POOL_ID'),
          requireValue(env.COGNITO_CLIENT_ID, 'COGNITO_CLIENT_ID'),
        )
      : new FakeAuthenticationProvider({
          email: env.FAKE_USER_EMAIL,
          password: env.FAKE_USER_PASSWORD,
          subject: env.FAKE_USER_SUB,
          requireTotp: true,
        });
  const identity = new IdentityAuthenticationService(
    authenticationProvider,
    users,
  );
  const learningRepository = new DrizzleLearningRepository(database);
  const mediaReadUrls =
    env.NODE_ENV === 'production'
      ? new CloudFrontMediaReadUrlProvider(
          new SecretsManagerClient({ region: env.AWS_REGION }),
          env.MEDIA_CDN_BASE_URL,
          env.MEDIA_KEY_PAIR_ID,
          env.MEDIA_PRIVATE_KEY_SECRET_ARN,
        )
      : new FakeMediaReadUrlProvider();
  const authorizer = {
    authMode: env.AUTH_MODE,
    cognitoClientId: env.COGNITO_CLIENT_ID ?? 'local-client',
    nodeEnv: env.NODE_ENV,
  };

  return {
    module: AppModule,
    imports: [
      IdentityModule.register({
        identity,
        users,
        authorizer,
        allowedOrigins: env.ALLOWED_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      }),
      LearningModule.register({
        questionQuery: new DrizzleLearnerQuestionQuery(database),
        vocabularyQuery: new DrizzleLearnerVocabularyQuery(database),
        questionAttempts: new QuestionAttemptService(learningRepository),
        savedContent: new SavedContentService(learningRepository),
        mediaReadUrls,
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
