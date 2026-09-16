/** HTTP 기능 모듈을 하나의 NestJS 애플리케이션으로 조립한다 */
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client } from '@aws-sdk/client-s3';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { SQSClient } from '@aws-sdk/client-sqs';
import { readApiEnv } from '@flex-thia/config';
import {
  createDataApiDatabase,
  createLocalDatabase,
  DrizzleAdminConceptQuery,
  DrizzleAdminHomeQuery,
  DrizzleAdminQuestionQuery,
  DrizzleAdminVocabularyQuery,
  DrizzleAiQuestionProductionRepository,
  DrizzleAsyncDispatchOutboxRepository,
  DrizzleAuditLogQuery,
  DrizzleConceptAdminRepository,
  DrizzleConceptErrorReportTargetLookup,
  DrizzleContentDraftRepository,
  DrizzleContentErrorReportQuery,
  DrizzleContentErrorReportRepository,
  DrizzleContentImportQuery,
  DrizzleContentImportRepository,
  DrizzleContentProductionPresetCatalog,
  DrizzleContentProductionRepository,
  DrizzleEmailChallengeRepository,
  DrizzleGeneratedQuestionDraftRepository,
  DrizzleLearnerConceptQuery,
  DrizzleLearnerQuestionQuery,
  DrizzleLearnerVocabularyQuery,
  DrizzleLearningRepository,
  DrizzleOperationsCostSettingsRepository,
  DrizzleQuestionAdminRepository,
  DrizzleQuestionCandidateQuery,
  DrizzleQuestionProductionContextQuery,
  DrizzleQuestionPublicationRepository,
  DrizzleQuestionTaxonomyQuery,
  DrizzleQuestionTaxonomyRepository,
  DrizzleReadinessProbe,
  DrizzleRecommendationQuery,
  DrizzleUploadRepository,
  DrizzleUsageCostOperationsQuery,
  DrizzleUserManagementQuery,
  DrizzleUserRepository,
  DrizzleVocabularyAdminRepository,
  DrizzleVocabularyCandidateQuery,
  DrizzleVocabularyCandidateReviewRepository,
  DrizzleVocabularyPracticeQuery,
  DrizzleVocabularyPracticeRepository,
  DrizzleVocabularyProductionLookup,
  DrizzleWordbookQuery,
  DrizzleWordbookRepository,
} from '@flex-thia/database';
import {
  AuditLogService,
  ConceptService,
  ContentDraftService,
  ContentErrorReportService,
  ContentImportService,
  ContentProductionService,
  IdentityAuthenticationService,
  PasswordlessAuthenticationService,
  QuestionAdminService,
  QuestionAttemptService,
  QuestionCandidateReviewService,
  QuestionPublicationService,
  QuestionTaxonomyService,
  SavedContentService,
  UploadPolicyService,
  UserManagementService,
  VocabularyAdminService,
  VocabularyCandidateReviewService,
  VocabularyPracticeService,
  WordbookService,
} from '@flex-thia/domain';
import {
  ChallengeCrypto,
  CognitoPasswordlessAuthenticationProvider,
  DeterministicContentProductionProcessor,
  FakeConceptContentValidator,
  FakeEmailChallengeSender,
  FakePasswordlessAuthenticationProvider,
  LocalContentProductionQueue,
  LocalFileUploadProvider,
  resolveLocalUploadDirectory,
  S3UploadProvider,
  SesEmailChallengeSender,
  SqsJobQueue,
  UnavailableConceptContentValidator,
} from '@flex-thia/providers';
import { type DynamicModule, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AdminModule } from './admin/admin.module.js';
import { ConceptsModule } from './concepts/concepts.module.js';
import { ContentProductionModule } from './content-production/content-production.module.js';
import { ContentErrorReportsModule } from './feedback/content-error-reports.module.js';
import { HealthController } from './health/health.controller.js';
import {
  ReadinessController,
  ReadinessService,
} from './health/readiness.service.js';
import { IdentityModule } from './identity/identity.module.js';
import { LearningModule } from './learning/learning.module.js';
import { VocabularyPracticeModule } from './learning/vocabulary-practice.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { QuestionTaxonomyModule } from './questions/question-taxonomy.module.js';
import { RecommendationsModule } from './recommendations/recommendations.module.js';
import { LocalUploadsModule } from './uploads/local-uploads.module.js';

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

const shuffle = <Value>(items: readonly Value[]): Value[] => {
  const copied = [...items];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copied[index], copied[target]] = [copied[target]!, copied[index]!];
  }
  return copied;
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
  const userManagementRepository = new DrizzleUserManagementQuery(database);
  const userManagement = new UserManagementService(
    userManagementRepository,
    userManagementRepository,
  );
  const learningRepository = new DrizzleLearningRepository(database);
  const localUploads =
    env.NODE_ENV === 'production'
      ? undefined
      : new LocalFileUploadProvider(
          resolveLocalUploadDirectory(source),
          env.FLEX_THIA_LOCAL_PUBLIC_ORIGIN,
          env.FLEX_THIA_LOCAL_UPLOAD_HMAC_SECRET,
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
  const contentDraftRepository = new DrizzleContentDraftRepository(database);
  const contentImportRepository = new DrizzleContentImportRepository(database);
  const contentImports = new ContentImportService(
    contentImportRepository,
    new ContentDraftService(contentDraftRepository),
  );
  const questionAdminRepository = new DrizzleQuestionAdminRepository(database);
  const questionPublicationRepository =
    new DrizzleQuestionPublicationRepository(database);
  const questionPublication = new QuestionPublicationService(
    questionPublicationRepository,
  );
  const vocabularyRepository = new DrizzleVocabularyAdminRepository(database);
  const vocabularyPracticeQuery = new DrizzleVocabularyPracticeQuery(database);
  const vocabularyPractice = new VocabularyPracticeService({
    repository: new DrizzleVocabularyPracticeRepository(
      database,
      vocabularyPracticeQuery,
    ),
    createId: randomUUID,
    now: () => new Date(),
    shuffle,
  });
  const conceptValidator =
    env.NODE_ENV === 'production'
      ? new UnavailableConceptContentValidator()
      : new FakeConceptContentValidator();
  const concepts = new ConceptService(
    new DrizzleConceptAdminRepository(database),
    conceptValidator,
  );
  const feedbackRepository = new DrizzleContentErrorReportRepository(
    database,
    new DrizzleConceptErrorReportTargetLookup(database),
  );
  const feedback = new ContentErrorReportService(
    feedbackRepository,
    feedbackRepository,
    feedbackRepository,
  );
  const contentProductionUploads = new DrizzleUploadRepository(database);
  const contentProductionStorage =
    env.NODE_ENV === 'production'
      ? new S3UploadProvider(
          new S3Client({ region: env.AWS_REGION }),
          requireValue(env.INPUT_BUCKET_NAME, 'INPUT_BUCKET_NAME'),
        )
      : localUploads!;
  const contentProductionRepository = new DrizzleContentProductionRepository(
    database,
  );
  const dispatchOutbox = new DrizzleAsyncDispatchOutboxRepository(database);
  const questionCandidateRepository = new DrizzleAiQuestionProductionRepository(
    database,
    () => new Date(),
    new DrizzleGeneratedQuestionDraftRepository(),
    dispatchOutbox,
  );
  const questionProductionContext = new DrizzleQuestionProductionContextQuery(
    database,
  );
  // Drizzle lookup은 schema를 좁히지 않는 port type으로 공개되어 local database를 명시적으로 연결한다.
  const vocabularyProductionLookup = new DrizzleVocabularyProductionLookup(
    database as unknown as ConstructorParameters<
      typeof DrizzleVocabularyProductionLookup
    >[0],
  );
  const contentProductionQueue =
    env.NODE_ENV === 'production'
      ? new SqsJobQueue(
          new SQSClient({ region: env.AWS_REGION }),
          requireValue(env.JOB_QUEUE_URL, 'JOB_QUEUE_URL'),
        )
      : new LocalContentProductionQueue(
          contentProductionRepository,
          new DeterministicContentProductionProcessor({
            vocabularyLookup: vocabularyProductionLookup,
            questionContext: questionProductionContext,
            questionCandidates: questionCandidateRepository,
          }),
        );
  const contentProductionPresets = new DrizzleContentProductionPresetCatalog(
    database,
  );
  const contentProduction = new ContentProductionService(
    contentProductionRepository,
    contentProductionQueue,
  );
  const vocabularyCandidateRepository =
    new DrizzleVocabularyCandidateReviewRepository(database);
  const questionTaxonomy = new QuestionTaxonomyService(
    new DrizzleQuestionTaxonomyRepository(database),
  );
  const auditLogs = new AuditLogService(new DrizzleAuditLogQuery(database));

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
        users,
        authorizer,
      }),
      AdminModule.register({
        contentImports,
        contentImportQuery: new DrizzleContentImportQuery(database),
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
      VocabularyPracticeModule.register({
        practice: vocabularyPractice,
        users,
        authorizer,
      }),
      ConceptsModule.register({
        learnerQuery: new DrizzleLearnerConceptQuery(database),
        adminQuery: new DrizzleAdminConceptQuery(database),
        adminService: concepts,
        users,
        authorizer,
      }),
      ContentErrorReportsModule.register({
        reports: feedback,
        query: new DrizzleContentErrorReportQuery(database),
        users,
        authorizer,
      }),
      RecommendationsModule.register({
        query: new DrizzleRecommendationQuery(database),
        users,
        authorizer,
      }),
      ContentProductionModule.register({
        uploads: contentProductionUploads,
        uploadPolicies: new UploadPolicyService(
          contentProductionUploads,
          contentProductionStorage,
          randomUUID,
        ),
        presets: contentProductionPresets,
        contentProduction,
        questionCandidates: new DrizzleQuestionCandidateQuery(database),
        questionCandidateReview: new QuestionCandidateReviewService(
          questionCandidateRepository,
        ),
        questionProductionContext,
        vocabularyCandidates: new DrizzleVocabularyCandidateQuery(database),
        vocabularyCandidateReview: new VocabularyCandidateReviewService(
          vocabularyCandidateRepository,
        ),
        users,
        authorizer,
      }),
      LocalUploadsModule.register(localUploads),
      QuestionTaxonomyModule.register({
        query: new DrizzleQuestionTaxonomyQuery(database),
        service: questionTaxonomy,
        users,
        authorizer,
      }),
      OperationsModule.register({
        auditLogs,
        homeQuery: new DrizzleAdminHomeQuery(database),
        usageCost: {
          query: new DrizzleUsageCostOperationsQuery(database),
          settings: new DrizzleOperationsCostSettingsRepository(database),
        },
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
