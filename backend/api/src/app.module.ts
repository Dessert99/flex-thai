/** HTTP 기능 모듈을 하나의 NestJS 애플리케이션으로 조립한다 */
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { type DynamicModule, Module } from '@nestjs/common';
import { readApiEnv } from '@flex-thia/config';
import {
  createDataApiDatabase,
  createLocalDatabase,
  DrizzleAdminMediaQuery,
  DrizzleAdminQuestionQuery,
  DrizzleAdminVocabularyQuery,
  DrizzleContentDraftRepository,
  DrizzleContentImportQuery,
  DrizzleContentImportRepository,
  DrizzleEmailChallengeRepository,
  DrizzleLearnerQuestionQuery,
  DrizzleLearnerVocabularyQuery,
  DrizzleLearningRepository,
  DrizzleMediaAdminRepository,
  DrizzleQuestionAdminRepository,
  DrizzleQuestionPublicationRepository,
  DrizzleReadinessProbe,
  DrizzleUserRepository,
  DrizzleUserManagementQuery,
  DrizzleVocabularyAdminRepository,
  DrizzleWordbookQuery,
  DrizzleWordbookRepository,
} from '@flex-thia/database';
import {
  ContentDraftService,
  ContentImportService,
  IdentityAuthenticationService,
  MediaAdminService,
  QuestionAdminService,
  QuestionAttemptService,
  QuestionPublicationService,
  SavedContentService,
  PasswordlessAuthenticationService,
  UserManagementService,
  VocabularyAdminService,
  WordbookService,
} from '@flex-thia/domain';
import {
  ChallengeCrypto,
  CloudFrontMediaReadUrlProvider,
  CognitoPasswordlessAuthenticationProvider,
  FakeAudioUploadProvider,
  FakeEmailChallengeSender,
  FakeMediaReadUrlProvider,
  FakePasswordlessAuthenticationProvider,
  S3AudioUploadProvider,
  SesEmailChallengeSender,
} from '@flex-thia/providers';
import { AdminModule } from './admin/admin.module.js';
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
  const fakeAuthenticationProvider =
    env.AUTH_MODE === 'fake'
      ? new FakePasswordlessAuthenticationProvider({
          mode: env.NODE_ENV === 'development' ? 'local' : env.NODE_ENV,
          accounts: [
            {
              email: env.FAKE_USER_EMAIL,
              subject: env.FAKE_USER_SUB,
              role: 'ADMIN',
            },
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
  const challengeCrypto = new ChallengeCrypto(env.CHALLENGE_HMAC_PEPPER);
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
  const userManagementRepository = new DrizzleUserManagementQuery(database);
  const userManagement = new UserManagementService(
    userManagementRepository,
    userManagementRepository,
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
    ...(fakeAuthenticationProvider
      ? {
          resolveFakeAccessTokenSubject: (accessToken: string) =>
            fakeAuthenticationProvider.resolveAccessTokenSubject(accessToken),
        }
      : {}),
  };
  const contentDraftRepository = new DrizzleContentDraftRepository(database);
  const contentImportRepository = new DrizzleContentImportRepository(database);
  const contentImports = new ContentImportService(
    contentImportRepository,
    new ContentDraftService(contentDraftRepository),
  );
  const mediaRepository = new DrizzleMediaAdminRepository(database);
  const audioStorage =
    env.NODE_ENV === 'production'
      ? new S3AudioUploadProvider(
          new S3Client({ region: env.AWS_REGION }),
          env.MEDIA_BUCKET_NAME,
        )
      : new FakeAudioUploadProvider();
  const media = new MediaAdminService(mediaRepository, audioStorage);
  const questionAdminRepository = new DrizzleQuestionAdminRepository(database);
  const questionPublicationRepository =
    new DrizzleQuestionPublicationRepository(database);
  const questionPublication = new QuestionPublicationService(
    questionPublicationRepository,
  );
  const vocabularyRepository = new DrizzleVocabularyAdminRepository(database);

  return {
    module: AppModule,
    imports: [
      IdentityModule.register({
        identity,
        passwordless,
        userManagement,
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
        wordbookQuery: new DrizzleWordbookQuery(database),
        wordbooks: new WordbookService(new DrizzleWordbookRepository(database)),
        mediaReadUrls,
        users,
        authorizer,
      }),
      AdminModule.register({
        contentImports,
        contentImportQuery: new DrizzleContentImportQuery(database),
        media,
        mediaQuery: new DrizzleAdminMediaQuery(database),
        questions: new QuestionAdminService(questionAdminRepository),
        questionPublication,
        questionQuery: new DrizzleAdminQuestionQuery(database),
        vocabularies: new VocabularyAdminService(vocabularyRepository),
        vocabularyQuery: new DrizzleAdminVocabularyQuery(database),
        findQuestionIdByVersionId: async (versionId) =>
          questionPublicationRepository.runInTransaction(
            async (transaction) =>
              (await transaction.loadVersion(versionId))?.questionId ?? null,
          ),
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
