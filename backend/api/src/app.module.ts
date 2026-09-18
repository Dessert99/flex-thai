import { DrizzleExtractionTemplateRepository } from '@flex-thia/database/repositories/content-production/drizzle-extraction-template.repository';
/** HTTP 기능 모듈을 하나의 NestJS 애플리케이션으로 조립한다 */
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client } from '@aws-sdk/client-s3';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { SQSClient } from '@aws-sdk/client-sqs';
import { readApiEnv } from '@flex-thia/config/api-env';
import { createDataApiDatabase } from '@flex-thia/database/clients/data-api';
import { createLocalDatabase } from '@flex-thia/database/clients/local';
import { DrizzleVocabularyCandidateQuery } from '@flex-thia/database/queries/content-production/drizzle-vocabulary-candidate.query';
import { DrizzleAdminConceptQuery } from '@flex-thia/database/queries/drizzle-admin-concept.query';
import { DrizzleAdminHomeQuery } from '@flex-thia/database/queries/drizzle-admin-home.query';
import { DrizzleAdminQuestionQuery } from '@flex-thia/database/queries/drizzle-admin-question.query';
import { DrizzleAdminVocabularyQuery } from '@flex-thia/database/queries/drizzle-admin-vocabulary.query';
import { DrizzleAuditLogQuery } from '@flex-thia/database/queries/drizzle-audit-log.query';
import { DrizzleConceptErrorReportTargetLookup } from '@flex-thia/database/queries/drizzle-concept-error-report-target.lookup';
import { DrizzleContentErrorReportQuery } from '@flex-thia/database/queries/drizzle-content-error-report.query';
import { DrizzleContentImportQuery } from '@flex-thia/database/queries/drizzle-content-import.query';
import { DrizzleLearnerConceptQuery } from '@flex-thia/database/queries/drizzle-learner-concept.query';
import { DrizzleLearnerQuestionQuery } from '@flex-thia/database/queries/drizzle-learner-question.query';
import { DrizzleLearnerVocabularyQuery } from '@flex-thia/database/queries/drizzle-learner-vocabulary.query';
import { DrizzleQuestionCandidateQuery } from '@flex-thia/database/queries/drizzle-question-candidate.query';
import { DrizzleQuestionProductionContextQuery } from '@flex-thia/database/queries/drizzle-question-production-context.query';
import { DrizzleQuestionTaxonomyQuery } from '@flex-thia/database/queries/drizzle-question-taxonomy.query';
import { DrizzleRecommendationQuery } from '@flex-thia/database/queries/drizzle-recommendation.query';
import { DrizzleUsageCostOperationsQuery } from '@flex-thia/database/queries/drizzle-usage-cost-operations.query';
import { DrizzleUserManagementQuery } from '@flex-thia/database/queries/drizzle-user-management.query';
import { DrizzleVocabularyPracticeQuery } from '@flex-thia/database/queries/drizzle-vocabulary-practice.query';
import { DrizzleVocabularyProductionLookup } from '@flex-thia/database/queries/drizzle-vocabulary-production.lookup';
import { DrizzleWordbookQuery } from '@flex-thia/database/queries/drizzle-wordbook.query';
import { DrizzleAiQuestionProductionRepository } from '@flex-thia/database/repositories/content-production/drizzle-ai-question-production.repository';
import {
  DrizzleContentProductionPresetCatalog,
  DrizzleContentProductionRepository,
} from '@flex-thia/database/repositories/content-production/drizzle-content-production.repository';
import { DrizzleGeneratedQuestionDraftRepository } from '@flex-thia/database/repositories/content-production/drizzle-generated-question-draft.repository';
import { DrizzleVocabularyCandidateReviewRepository } from '@flex-thia/database/repositories/content-production/drizzle-vocabulary-candidate-review.repository';
import { DrizzleAsyncDispatchOutboxRepository } from '@flex-thia/database/repositories/dispatch/drizzle-async-dispatch-outbox.repository';
import { DrizzleConceptAdminRepository } from '@flex-thia/database/repositories/drizzle-concept-admin.repository';
import { DrizzleContentDraftRepository } from '@flex-thia/database/repositories/drizzle-content-draft.repository';
import { DrizzleContentErrorReportRepository } from '@flex-thia/database/repositories/drizzle-content-error-report.repository';
import { DrizzleContentImportRepository } from '@flex-thia/database/repositories/drizzle-content-import.repository';
import { DrizzleEmailChallengeRepository } from '@flex-thia/database/repositories/drizzle-email-challenge.repository';
import { DrizzleLearningRepository } from '@flex-thia/database/repositories/drizzle-learning.repository';
import { DrizzleOperationsCostSettingsRepository } from '@flex-thia/database/repositories/drizzle-operations-cost-settings.repository';
import { DrizzleQuestionAdminRepository } from '@flex-thia/database/repositories/drizzle-question-admin.repository';
import { DrizzleQuestionTaxonomyRepository } from '@flex-thia/database/repositories/drizzle-question-taxonomy.repository';
import { DrizzleReadinessProbe } from '@flex-thia/database/repositories/drizzle-readiness.probe';
import { DrizzleUploadRepository } from '@flex-thia/database/repositories/drizzle-upload.repository';
import { DrizzleUserRepository } from '@flex-thia/database/repositories/drizzle-user.repository';
import { DrizzleVocabularyAdminRepository } from '@flex-thia/database/repositories/drizzle-vocabulary-admin.repository';
import { DrizzleVocabularyPracticeRepository } from '@flex-thia/database/repositories/drizzle-vocabulary-practice.repository';
import { DrizzleWordbookRepository } from '@flex-thia/database/repositories/drizzle-wordbook.repository';
import { ConceptService } from '@flex-thia/domain/concepts/concept.service';
import { ContentDraftService } from '@flex-thia/domain/content-import/content-draft';
import { ContentImportService } from '@flex-thia/domain/content-import/content-import.service';
import { QuestionCandidateReviewService } from '@flex-thia/domain/content-production/ai-question-production';
import { ContentProductionService } from '@flex-thia/domain/content-production/content-production.service';
import { VocabularyCandidateReviewService } from '@flex-thia/domain/content-production/vocabulary-candidate-review';
import { ContentErrorReportService } from '@flex-thia/domain/feedback/content-error-report.service';
import { IdentityAuthenticationService } from '@flex-thia/domain/identity/authentication.service';
import { PasswordlessAuthenticationService } from '@flex-thia/domain/identity/passwordless-authentication.service';
import { UserManagementService } from '@flex-thia/domain/identity/user-management';
import { QuestionAttemptService } from '@flex-thia/domain/learning/question-attempt';
import { SavedContentService } from '@flex-thia/domain/learning/saved-content';
import { VocabularyPracticeService } from '@flex-thia/domain/learning/vocabulary-practice';
import { WordbookService } from '@flex-thia/domain/learning/wordbook';
import { AuditLogService } from '@flex-thia/domain/operations/audit-log.service';
import { QuestionAdminService } from '@flex-thia/domain/questions/question-admin';
import { QuestionTaxonomyService } from '@flex-thia/domain/questions/question-taxonomy.service';
import { UploadPolicyService } from '@flex-thia/domain/uploads/upload-policy.service';
import { VocabularyAdminService } from '@flex-thia/domain/vocabulary/vocabulary-admin';
import { S3UploadProvider } from '@flex-thia/providers/aws/s3-upload.provider';
import { SqsJobQueue } from '@flex-thia/providers/aws/sqs-job.queue';
import { ChallengeCrypto } from '@flex-thia/providers/crypto/challenge-crypto';
import { DeterministicContentProductionProcessor } from '@flex-thia/providers/fakes/deterministic-content-production.processor';
import { FakeConceptContentValidator } from '@flex-thia/providers/fakes/fake-concept-content.validator';
import { FakeEmailChallengeSender } from '@flex-thia/providers/fakes/fake-email-challenge.sender';
import { LocalContentProductionQueue } from '@flex-thia/providers/fakes/local-content-production.queue';
import { CognitoPasswordlessAuthenticationProvider } from '@flex-thia/providers/identity/cognito-passwordless-authentication.provider';
import { FakePasswordlessAuthenticationProvider } from '@flex-thia/providers/identity/fake-passwordless-authentication.provider';
import { SesEmailChallengeSender } from '@flex-thia/providers/messaging/ses-email-challenge.sender';
import {
  LocalFileUploadProvider,
  resolveLocalUploadDirectory,
} from '@flex-thia/providers/storage/local-file-upload.provider';
import { UnavailableConceptContentValidator } from '@flex-thia/providers/validation/unavailable-concept-content.validator';
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
        questionQuery: new DrizzleAdminQuestionQuery(database),
        vocabularies: new VocabularyAdminService(vocabularyRepository),
        vocabularyQuery: new DrizzleAdminVocabularyQuery(database),
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
        extractionTemplates: new DrizzleExtractionTemplateRepository(database),
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
