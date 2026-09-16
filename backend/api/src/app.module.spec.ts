import { AdminContentService } from './admin/admin-content.service.js';
import { LearnerContentService } from './learning/learner-content.service.js';
/** root가 학습·관리·운영 기능과 환경별 provider를 조립하는지 검증한다 */
import { DrizzleAdminHomeQuery } from '@flex-thia/database/queries/drizzle-admin-home.query';
import { DrizzleAiQuestionProductionRepository } from '@flex-thia/database/repositories/content-production/drizzle-ai-question-production.repository';
import {
  DrizzleContentProductionPresetCatalog,
  DrizzleContentProductionRepository,
} from '@flex-thia/database/repositories/content-production/drizzle-content-production.repository';
import { DrizzleEmailChallengeRepository } from '@flex-thia/database/repositories/drizzle-email-challenge.repository';
import { DrizzleOperationsCostSettingsRepository } from '@flex-thia/database/repositories/drizzle-operations-cost-settings.repository';
import { DrizzleQuestionProductionContextQuery } from '@flex-thia/database/queries/drizzle-question-production-context.query';
import { DrizzleRecommendationQuery } from '@flex-thia/database/queries/drizzle-recommendation.query';
import { DrizzleUploadRepository } from '@flex-thia/database/repositories/drizzle-upload.repository';
import { DrizzleUsageCostOperationsQuery } from '@flex-thia/database/queries/drizzle-usage-cost-operations.query';
import { DrizzleUserManagementQuery } from '@flex-thia/database/queries/drizzle-user-management.query';
import { DrizzleVocabularyProductionLookup } from '@flex-thia/database/queries/drizzle-vocabulary-production.lookup';
import { DrizzleWordbookQuery } from '@flex-thia/database/queries/drizzle-wordbook.query';
import { DrizzleWordbookRepository } from '@flex-thia/database/repositories/drizzle-wordbook.repository';
import { ContentProductionService } from '@flex-thia/domain/content-production/content-production.service';
import { IdentityAuthenticationService } from '@flex-thia/domain/identity/authentication.service';
import { PasswordlessAuthenticationService } from '@flex-thia/domain/identity/passwordless-authentication.service';
import { UserManagementService } from '@flex-thia/domain/identity/user-management';
import { WordbookService } from '@flex-thia/domain/learning/wordbook';
import { ChallengeCrypto } from '@flex-thia/providers/crypto/challenge-crypto';
import { CognitoPasswordlessAuthenticationProvider } from '@flex-thia/providers/identity/cognito-passwordless-authentication.provider';
import { DeterministicContentProductionProcessor } from '@flex-thia/providers/fakes/deterministic-content-production.processor';
import { FakeEmailChallengeSender } from '@flex-thia/providers/fakes/fake-email-challenge.sender';
import { FakePasswordlessAuthenticationProvider } from '@flex-thia/providers/identity/fake-passwordless-authentication.provider';
import { LocalContentProductionQueue } from '@flex-thia/providers/fakes/local-content-production.queue';
import { LocalFileUploadProvider } from '@flex-thia/providers/storage/local-file-upload.provider';
import { S3UploadProvider } from '@flex-thia/providers/aws/s3-upload.provider';
import { SesEmailChallengeSender } from '@flex-thia/providers/messaging/ses-email-challenge.sender';
import { SqsJobQueue } from '@flex-thia/providers/aws/sqs-job.queue';
import { describe, expect, it } from 'vitest';
import { createApplicationModule } from './app.module.js';
import { ContentProductionApplicationService } from './content-production/content-production.service.js';
import { AdminUserManagementController } from './identity/admin-user-management.controller.js';
import { LearnerWordbooksService } from './learning/learner-wordbooks.service.js';
import { AdminHomeService } from './operations/admin-home.service.js';
import { UsageCostOperationsService } from './operations/usage-cost-operations.service.js';
import { RecommendationsService } from './recommendations/recommendations.service.js';

describe('createApplicationModule 조립', () => {
  it('로컬 설정에서 전체 HTTP 기능과 실제 local adapter를 조립한다', () => {
    const application = createApplicationModule({
      NODE_ENV: 'test',
      AUTH_MODE: 'fake',
      DATABASE_MODE: 'local',
      DATABASE_URL: 'postgres://local/test',
      FLEX_THIA_LOCAL_API_ORIGIN: 'http://127.0.0.1:3000',
      FLEX_THIA_LOCAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
    });

    const importedModuleNames = application.imports?.map(
      (entry) => (entry as { module: { name: string } }).module.name,
    );
    const rootControllerNames = application.controllers?.map(
      (controller) => (controller as { name: string }).name,
    );
    expect(importedModuleNames).not.toContain('JobsModule');
    expect(importedModuleNames).not.toContain('UploadsModule');
    expect(rootControllerNames).toEqual([
      'HealthController',
      'ReadinessController',
    ]);
    expect(rootControllerNames).not.toContain('JobsController');
    expect(rootControllerNames).not.toContain('UploadsController');
    expect(application.providers).toHaveLength(1);

    const identity = application.imports?.[0] as {
      controllers: unknown[];
      providers: { provide: unknown; useValue: unknown }[];
    };
    const authentication = identity.providers.find(
      ({ provide }) => provide === IdentityAuthenticationService,
    )?.useValue as { provider: unknown };
    const passwordless = identity.providers.find(
      ({ provide }) => provide === PasswordlessAuthenticationService,
    )?.useValue as {
      provider: unknown;
      repository: unknown;
      sender: unknown;
      secrets: {
        createChallengeSecrets(): { code: string };
      };
    };
    const management = identity.providers.find(
      ({ provide }) => provide === UserManagementService,
    )?.useValue as { invitations: unknown; users: unknown };

    expect(identity.controllers).toContain(AdminUserManagementController);
    expect(authentication.provider).toBeInstanceOf(
      FakePasswordlessAuthenticationProvider,
    );
    expect(passwordless.provider).toBe(authentication.provider);
    expect(passwordless.repository).toBeInstanceOf(
      DrizzleEmailChallengeRepository,
    );
    expect(passwordless.sender).toBeInstanceOf(FakeEmailChallengeSender);
    expect(passwordless.secrets).toBeInstanceOf(ChallengeCrypto);
    expect(passwordless.secrets.createChallengeSecrets().code).toBe('123456');
    expect(management.users).toBeInstanceOf(DrizzleUserManagementQuery);
    expect(management.invitations).toBe(management.users);

    const learning = application.imports?.[1] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const content = learning.providers.find(
      (provider) => provider.provide === LearnerContentService,
    )?.useValue as {
      dependencies: {
        questionQuery: { database: unknown };
        vocabularyQuery: { database: unknown };
        questionAttempts: { repository: { database: unknown } };
        savedContent: { repository: unknown };
      };
    };

    expect(content.dependencies.questionQuery.database).toBe(
      content.dependencies.vocabularyQuery.database,
    );
    expect(content.dependencies.questionQuery.database).toBe(
      content.dependencies.questionAttempts.repository.database,
    );
    expect(content.dependencies.questionAttempts.repository).toBe(
      content.dependencies.savedContent.repository,
    );
    const wordbooks = learning.providers.find(
      (provider) => provider.provide === LearnerWordbooksService,
    )?.useValue as {
      dependencies: {
        query: unknown;
        wordbooks: { repository: unknown };
      };
    };
    expect(wordbooks.dependencies.query).toBeInstanceOf(DrizzleWordbookQuery);
    expect(wordbooks.dependencies.wordbooks).toBeInstanceOf(WordbookService);
    expect(wordbooks.dependencies.wordbooks.repository).toBeInstanceOf(
      DrizzleWordbookRepository,
    );

    const admin = application.imports?.[2] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const adminContent = admin.providers.find(
      (provider) => provider.provide === AdminContentService,
    )?.useValue as {
      dependencies: {
        contentImports: {
          repository: { database: unknown };
          drafts: { repository: { database: unknown } };
        };
        contentImportQuery: { database: unknown };
        questions: { repository: { database: unknown } };
        questionPublication: { repository: { database: unknown } };
        questionQuery: { database: unknown };
        vocabularies: { repository: { database: unknown } };
        vocabularyQuery: { database: unknown };
      };
    };

    const adminDatabase = adminContent.dependencies.contentImportQuery.database;

    expect(adminContent.dependencies.contentImports.repository.database).toBe(
      adminDatabase,
    );
    expect(
      adminContent.dependencies.contentImports.drafts.repository.database,
    ).toBe(adminDatabase);
    expect(adminContent.dependencies.questions.repository.database).toBe(
      adminDatabase,
    );
    expect(
      adminContent.dependencies.questionPublication.repository.database,
    ).toBe(adminDatabase);
    expect(adminContent.dependencies.questionQuery.database).toBe(
      adminDatabase,
    );
    expect(adminContent.dependencies.vocabularies.repository.database).toBe(
      adminDatabase,
    );
    expect(adminContent.dependencies.vocabularyQuery.database).toBe(
      adminDatabase,
    );

    const recommendations = application.imports?.[6] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const recommendationService = recommendations.providers.find(
      ({ provide }) => provide === RecommendationsService,
    )?.useValue as { query: unknown };
    expect(recommendationService.query).toBeInstanceOf(
      DrizzleRecommendationQuery,
    );

    const contentProductionModule = application.imports?.[7] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const contentProduction = contentProductionModule.providers.find(
      ({ provide }) => provide === ContentProductionApplicationService,
    )?.useValue as {
      uploads: unknown;
      presets: unknown;
      contentProduction: {
        repository: unknown;
        queue: {
          repository: unknown;
          processor: {
            vocabularyLookup: unknown;
            questionContext: unknown;
            questionCandidates: unknown;
          };
        };
      };
      uploadPolicies: { repository: unknown; storage: unknown };
      questionProductionContext: unknown;
    };
    expect(contentProduction.uploads).toBeInstanceOf(DrizzleUploadRepository);
    expect(contentProduction.presets).toBeInstanceOf(
      DrizzleContentProductionPresetCatalog,
    );
    expect(contentProduction.contentProduction).toBeInstanceOf(
      ContentProductionService,
    );
    expect(contentProduction.contentProduction.repository).toBeInstanceOf(
      DrizzleContentProductionRepository,
    );
    expect(contentProduction.contentProduction.queue).toBeInstanceOf(
      LocalContentProductionQueue,
    );
    expect(contentProduction.contentProduction.queue.repository).toBe(
      contentProduction.contentProduction.repository,
    );
    expect(contentProduction.contentProduction.queue.processor).toBeInstanceOf(
      DeterministicContentProductionProcessor,
    );
    expect(
      contentProduction.contentProduction.queue.processor.vocabularyLookup,
    ).toBeInstanceOf(DrizzleVocabularyProductionLookup);
    expect(
      contentProduction.contentProduction.queue.processor.questionContext,
    ).toBe(contentProduction.questionProductionContext);
    expect(
      contentProduction.contentProduction.queue.processor.questionCandidates,
    ).toBeInstanceOf(DrizzleAiQuestionProductionRepository);
    expect(contentProduction.uploadPolicies.repository).toBe(
      contentProduction.uploads,
    );
    expect(contentProduction.uploadPolicies.storage).toBeInstanceOf(
      LocalFileUploadProvider,
    );
    expect(contentProduction.questionProductionContext).toBeInstanceOf(
      DrizzleQuestionProductionContextQuery,
    );

    const operationsModule = application.imports?.[10] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const usageCost = operationsModule.providers.find(
      ({ provide }) => provide === UsageCostOperationsService,
    )?.useValue as {
      dependencies: { query: unknown; settings: unknown };
    };
    expect(usageCost.dependencies.query).toBeInstanceOf(
      DrizzleUsageCostOperationsQuery,
    );
    expect(usageCost.dependencies.settings).toBeInstanceOf(
      DrizzleOperationsCostSettingsRepository,
    );
    const adminHome = operationsModule.providers.find(
      ({ provide }) => provide === AdminHomeService,
    )?.useValue as {
      dependencies: { query: unknown };
    };
    expect(adminHome.dependencies.query).toBeInstanceOf(DrizzleAdminHomeQuery);
  });

  it('운영 환경은 같은 Learning 조립에서 CloudFront signer를 선택한다', () => {
    const application = createApplicationModule({
      NODE_ENV: 'production',
      AUTH_MODE: 'cognito',
      DATABASE_MODE: 'data-api',
      AWS_REGION: 'ap-northeast-2',
      DATABASE_NAME: 'flex_thia',
      RDS_RESOURCE_ARN: 'arn:rds',
      RDS_SECRET_ARN: 'arn:secret',
      COGNITO_USER_POOL_ID: 'pool',
      COGNITO_CLIENT_ID: 'client',
      INPUT_BUCKET_NAME: 'input-bucket',
      JOB_QUEUE_URL: 'https://sqs.example.com/jobs',
      CUSTOM_AUTH_SECRET: 'C'.repeat(32),
      CUSTOM_AUTH_SECRET_ARN: 'arn:custom-auth-secret',
      CHALLENGE_HMAC_PEPPER: 'P'.repeat(32),
      CHALLENGE_HMAC_PEPPER_SECRET_ARN: 'arn:pepper-secret',
      EMAIL_LINK_CONFIRMATION_URL: 'https://www.example.com/login/confirm',
      FROM_EMAIL: 'login@example.com',
    });

    const identity = application.imports?.[0] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const authentication = identity.providers.find(
      ({ provide }) => provide === IdentityAuthenticationService,
    )?.useValue as { provider: unknown };
    const passwordless = identity.providers.find(
      ({ provide }) => provide === PasswordlessAuthenticationService,
    )?.useValue as { provider: unknown; sender: unknown };
    expect(authentication.provider).toBeInstanceOf(
      CognitoPasswordlessAuthenticationProvider,
    );
    expect(passwordless.provider).toBe(authentication.provider);
    expect(passwordless.sender).toBeInstanceOf(SesEmailChallengeSender);

    const contentProductionModule = application.imports?.[7] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const contentProduction = contentProductionModule.providers.find(
      ({ provide }) => provide === ContentProductionApplicationService,
    )?.useValue as {
      contentProduction: { queue: unknown };
      uploadPolicies: { storage: unknown };
    };
    expect(contentProduction.contentProduction.queue).toBeInstanceOf(
      SqsJobQueue,
    );
    expect(contentProduction.uploadPolicies.storage).toBeInstanceOf(
      S3UploadProvider,
    );
  });
});
