/** HTTP 기능 모듈을 하나의 NestJS 애플리케이션으로 조립한다 */
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client } from '@aws-sdk/client-s3';
import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import { type DynamicModule, Module } from '@nestjs/common';
import { readApiEnv } from '@flex-thia/config';
import {
  createDataApiDatabase,
  createLocalDatabase,
  DrizzleAuthChallengeRepository,
  DrizzleJobRepository,
  DrizzleReadinessProbe,
  DrizzleStepUpRepository,
  DrizzleUploadRepository,
  DrizzleUserRepository,
} from '@flex-thia/database';
import {
  CreateJobService,
  PasswordlessAuthService,
  StepUpService,
  UploadPolicyService,
} from '@flex-thia/domain';
import {
  ChallengeCrypto,
  CognitoIdentityProvider,
  CognitoPhoneVerificationProvider,
  FakeIdentityProvider,
  FakeJobQueue,
  FakePhoneVerificationProvider,
  FakeSmsSender,
  FakeUploadProvider,
  S3UploadProvider,
  SnsSmsSender,
  SqsJobQueue,
} from '@flex-thia/providers';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import {
  ReadinessController,
  ReadinessService,
} from './health/readiness.service.js';
import { JobsModule } from './jobs/jobs.module.js';
import { UploadsModule } from './uploads/uploads.module.js';

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
  const database: ConstructorParameters<typeof DrizzleJobRepository>[0] =
    env.DATABASE_MODE === 'local'
      ? createLocalDatabase(env.DATABASE_URL)
      : createDataApiDatabase({
          region: env.AWS_REGION,
          database: env.DATABASE_NAME,
          resourceArn: requireValue(env.RDS_RESOURCE_ARN, 'RDS_RESOURCE_ARN'),
          secretArn: requireValue(env.RDS_SECRET_ARN, 'RDS_SECRET_ARN'),
        });
  const challenges = new DrizzleAuthChallengeRepository(database);
  const jobs = new DrizzleJobRepository(database);
  const stepUps = new DrizzleStepUpRepository(database);
  const uploads = new DrizzleUploadRepository(database);
  const users = new DrizzleUserRepository(database);
  const crypto = new ChallengeCrypto(
    Buffer.from(
      env.CHALLENGE_SESSION_KEY_BASE64 ??
        Buffer.alloc(32, 7).toString('base64'),
      'base64',
    ),
    env.CHALLENGE_HMAC_PEPPER ?? 'local-only-challenge-pepper',
  );
  const cognitoClient =
    env.AUTH_MODE === 'cognito'
      ? new CognitoIdentityProviderClient({ region: env.AWS_REGION })
      : null;
  const identity =
    cognitoClient === null
      ? new FakeIdentityProvider(
          {
            accessToken: 'local-access-token',
            refreshToken: 'local-refresh-token',
            expiresIn: 3600,
            subject: env.FAKE_USER_SUB,
            email: env.FAKE_USER_EMAIL,
          },
          async ({ challengeId, email }) => {
            await challenges.create({
              id: challengeId,
              emailHash: crypto.hashAnswer(email),
              codeHmac: crypto.hashAnswer('123456'),
              linkHmac: crypto.hashAnswer('local-link-token'),
              expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            });
          },
        )
      : new CognitoIdentityProvider(
          cognitoClient,
          requireValue(env.COGNITO_USER_POOL_ID, 'COGNITO_USER_POOL_ID'),
          requireValue(env.COGNITO_CLIENT_ID, 'COGNITO_CLIENT_ID'),
        );
  const phone =
    cognitoClient === null
      ? new FakePhoneVerificationProvider(env.FAKE_PHONE_NUMBER)
      : new CognitoPhoneVerificationProvider(cognitoClient);
  const queue = env.JOB_QUEUE_URL
    ? new SqsJobQueue(
        new SQSClient({ region: env.AWS_REGION }),
        env.JOB_QUEUE_URL,
      )
    : new FakeJobQueue();
  const storage = env.INPUT_BUCKET_NAME
    ? new S3UploadProvider(
        new S3Client({ region: env.AWS_REGION }),
        env.INPUT_BUCKET_NAME,
      )
    : new FakeUploadProvider();
  const sms =
    env.NODE_ENV === 'production'
      ? new SnsSmsSender(new SNSClient({ region: env.AWS_REGION }))
      : new FakeSmsSender();
  const auth = new PasswordlessAuthService(
    challenges,
    identity,
    crypto,
    env.SCHOOL_EMAIL_DOMAINS.split(',')
      .map((domain) => domain.trim())
      .filter(Boolean),
  );
  const stepUp = new StepUpService(
    stepUps,
    crypto,
    sms,
    () =>
      env.NODE_ENV === 'production'
        ? String(randomInt(0, 1_000_000)).padStart(6, '0')
        : '123456',
    () => randomBytes(32).toString('base64url'),
  );
  const uploadPolicy = new UploadPolicyService(uploads, storage, randomUUID);

  return {
    module: AppModule,
    imports: [
      AuthModule.register({
        auth,
        users,
        authorizer: {
          authMode: env.AUTH_MODE,
          cognitoClientId: env.COGNITO_CLIENT_ID ?? 'local-client',
          nodeEnv: env.NODE_ENV,
        },
        allowedOrigins: env.ALLOWED_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
        stepUp,
        stepUpRepository: stepUps,
        challengeCrypto: crypto,
        phone,
      }),
      JobsModule.register({
        uploads,
        createJobService: new CreateJobService(jobs, queue),
        jobs,
      }),
      UploadsModule.register({ uploads: uploadPolicy }),
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
