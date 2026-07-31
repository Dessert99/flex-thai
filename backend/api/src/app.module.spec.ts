/** root가 학습·관리·운영 기능과 환경별 provider를 조립하는지 검증한다 */
import {
  DrizzleAdminHomeQuery,
  DrizzleContentProductionPresetCatalog,
  DrizzleContentProductionRepository,
  DrizzleOperationsCostSettingsRepository,
  DrizzleQuestionProductionContextQuery,
  DrizzleTtsVoicePresetQuery,
  DrizzleTtsVoicePresetRepository,
  DrizzleUsageCostOperationsQuery,
  DrizzleEmailChallengeRepository,
  DrizzleRecommendationQuery,
  DrizzleUploadRepository,
  DrizzleUserManagementQuery,
  DrizzleWordbookQuery,
  DrizzleWordbookRepository,
} from '@flex-thia/database';
import {
  completeMediaAsset,
  ContentProductionService,
  IdentityAuthenticationService,
  type MediaAdminRepository,
  type MediaAsset,
  type MediaAdminService,
  PasswordlessAuthenticationService,
  UserManagementService,
  WordbookService,
} from '@flex-thia/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  ChallengeCrypto,
  CloudFrontMediaReadUrlProvider,
  CognitoPasswordlessAuthenticationProvider,
  DeterministicContentProductionProcessor,
  FakeAudioUploadProvider,
  FakeEmailChallengeSender,
  FakePasswordlessAuthenticationProvider,
  FakeUploadProvider,
  LocalContentProductionQueue,
  S3AudioUploadProvider,
  S3UploadProvider,
  SesEmailChallengeSender,
  SqsJobQueue,
  LocalFileMediaReadProvider,
} from '@flex-thia/providers';
import { AdminContentService } from './admin/admin-content.service.js';
import { ContentProductionApplicationService } from './content-production/content-production.service.js';
import { TtsOperationsService } from './media/tts-operations.service.js';
import { TtsVoicePresetsService } from './media/tts-voice-presets.service.js';
import { UsageCostOperationsService } from './operations/usage-cost-operations.service.js';
import { AdminHomeService } from './operations/admin-home.service.js';
import { AdminUserManagementController } from './identity/admin-user-management.controller.js';
import { LearnerContentService } from './learning/learner-content.service.js';
import { LearnerWordbooksService } from './learning/learner-wordbooks.service.js';
import { RecommendationsService } from './recommendations/recommendations.service.js';
import { createApplicationModule } from './app.module.js';

describe('createApplicationModule 조립', () => {
  it('로컬 설정에서 전체 HTTP 기능과 실제 local adapter를 조립한다', async () => {
    const application = createApplicationModule({
      NODE_ENV: 'test',
      AUTH_MODE: 'fake',
      DATABASE_MODE: 'local',
      DATABASE_URL: 'postgres://local/test',
      FLEX_THIA_LOCAL_TTS_AUDIO_DIRECTORY: '/tmp/flex-thia-app-media',
      FLEX_THIA_LOCAL_API_ORIGIN: 'http://127.0.0.1:3000',
      FLEX_THIA_LOCAL_MEDIA_HMAC_SECRET:
        'local-media-hmac-secret-that-is-not-production',
    });

    const importedModuleNames = application.imports?.map(
      (entry) => (entry as { module: { name: string } }).module.name,
    );
    const rootControllerNames = application.controllers?.map(
      (controller) => (controller as { name: string }).name,
    );

    expect(importedModuleNames).toEqual([
      'IdentityModule',
      'LearningModule',
      'AdminModule',
      'VocabularyPracticeModule',
      'ConceptsModule',
      'ContentErrorReportsModule',
      'RecommendationsModule',
      'ContentProductionModule',
      'MediaModule',
      'QuestionTaxonomyModule',
      'OperationsModule',
    ]);
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
        mediaReadUrls: LocalFileMediaReadProvider;
      };
    };

    expect(content.dependencies.mediaReadUrls).toBeInstanceOf(
      LocalFileMediaReadProvider,
    );
    await expect(
      content.dependencies.mediaReadUrls.createReadUrl(
        'private/tts/runs/00000000-0000-4000-8000-000000000001.wav',
        new Date(Date.now() + 60_000),
      ),
    ).resolves.toMatch(/^http:\/\/127\.0\.0\.1:3000\/api\/v1\/local-media\//u);
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
        media: { repository: { database: unknown }; storage: unknown };
        mediaQuery: { database: unknown };
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
    expect(adminContent.dependencies.media.storage).toBeInstanceOf(
      FakeAudioUploadProvider,
    );
    expect(adminContent.dependencies.media.repository.database).toBe(
      adminDatabase,
    );
    expect(adminContent.dependencies.mediaQuery.database).toBe(adminDatabase);
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
        queue: { repository: unknown; processor: unknown };
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
    expect(contentProduction.uploadPolicies.repository).toBe(
      contentProduction.uploads,
    );
    expect(contentProduction.uploadPolicies.storage).toBeInstanceOf(
      FakeUploadProvider,
    );
    expect(contentProduction.questionProductionContext).toBeInstanceOf(
      DrizzleQuestionProductionContextQuery,
    );

    const mediaModule = application.imports?.[8] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const ttsOperations = mediaModule.providers.find(
      ({ provide }) => provide === TtsOperationsService,
    )?.useValue as { dependencies: { mediaReadUrls: unknown } };
    const ttsPresets = mediaModule.providers.find(
      ({ provide }) => provide === TtsVoicePresetsService,
    )?.useValue as {
      dependencies: {
        query: unknown;
        repository: unknown;
        activePresetId: string;
      };
    };
    expect(ttsOperations.dependencies.mediaReadUrls).toBeInstanceOf(
      LocalFileMediaReadProvider,
    );
    expect(ttsPresets.dependencies.query).toBeInstanceOf(
      DrizzleTtsVoicePresetQuery,
    );
    expect(ttsPresets.dependencies.repository).toBeInstanceOf(
      DrizzleTtsVoicePresetRepository,
    );
    expect(ttsPresets.dependencies.activePresetId).toBe(
      '00000000-0000-4000-8000-000000000001',
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

  it('로컬 기본 fake는 upload 요청 직후 선언 metadata로 READY 완료를 지원한다', async () => {
    const application = createApplicationModule({
      NODE_ENV: 'test',
      AUTH_MODE: 'fake',
      DATABASE_MODE: 'local',
      DATABASE_URL: 'postgres://local/test',
    });
    const admin = application.imports?.[2] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const adminContent = admin.providers.find(
      (provider) => provider.provide === AdminContentService,
    )?.useValue as {
      dependencies: {
        media: Pick<
          MediaAdminService,
          'completeAudioUpload' | 'requestAudioUpload'
        > & {
          repository: MediaAdminRepository;
        };
      };
    };
    const media = adminContent.dependencies.media;
    let storedAsset: MediaAsset | null = null;
    vi.spyOn(media.repository, 'findReadyByMetadata').mockResolvedValue(null);
    vi.spyOn(media.repository, 'createUploadingWithAudit').mockImplementation(
      ({ asset }) => {
        storedAsset = asset;
        return Promise.resolve();
      },
    );
    vi.spyOn(media.repository, 'findById').mockImplementation(() => {
      return Promise.resolve(storedAsset);
    });
    vi.spyOn(media.repository, 'finalizeWithAudit').mockImplementation(
      ({ inspection, readyAt }) => {
        if (!storedAsset) return Promise.resolve(null);
        const ready = completeMediaAsset(storedAsset, inspection, readyAt);
        storedAsset = ready;
        return Promise.resolve({ outcome: 'READY', asset: ready });
      },
    );
    const declaredSha256 = 'A'.repeat(64);

    const requested = await media.requestAudioUpload({
      filename: 'voice.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256: declaredSha256,
      context: {
        actorSub: 'cognito-sub',
        actorUserId: '00000000-0000-4000-8000-000000000001',
        requestId: 'request-id',
      },
    });
    if (!requested.uploadRequired) {
      throw new Error('새 local upload form이 필요합니다');
    }
    const completed = await media.completeAudioUpload(requested.mediaAssetId, {
      actorSub: 'cognito-sub',
      actorUserId: '00000000-0000-4000-8000-000000000001',
      requestId: 'request-id',
    });

    expect(requested.upload.url).toBe('http://localhost/__fake_audio_upload__');
    expect(completed).toMatchObject({
      id: requested.mediaAssetId,
      status: 'READY',
      mimeType: 'audio/mpeg',
      sizeBytes: 3,
      sha256: declaredSha256.toLowerCase(),
    });
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
      MEDIA_CDN_BASE_URL: 'https://media.example.com',
      MEDIA_KEY_PAIR_ID: 'key-pair',
      MEDIA_PRIVATE_KEY_SECRET_ARN: 'arn:media-secret',
      MEDIA_BUCKET_NAME: 'media-bucket',
      INPUT_BUCKET_NAME: 'input-bucket',
      JOB_QUEUE_URL: 'https://sqs.example.com/jobs',
      TTS_VOICE_PRESET_ID: '00000000-0000-4000-8000-000000000001',
      CUSTOM_AUTH_SECRET: 'C'.repeat(32),
      CUSTOM_AUTH_SECRET_ARN: 'arn:custom-auth-secret',
      CHALLENGE_HMAC_PEPPER: 'P'.repeat(32),
      CHALLENGE_HMAC_PEPPER_SECRET_ARN: 'arn:pepper-secret',
      EMAIL_LINK_CONFIRMATION_URL: 'https://www.example.com/login/confirm',
      FROM_EMAIL: 'login@example.com',
    });
    const learning = application.imports?.[1] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const content = learning.providers.find(
      (provider) => provider.provide === LearnerContentService,
    )?.useValue as {
      dependencies: { mediaReadUrls: unknown };
    };

    expect(content.dependencies.mediaReadUrls).toBeInstanceOf(
      CloudFrontMediaReadUrlProvider,
    );

    const admin = application.imports?.[2] as {
      providers: { provide: unknown; useValue: unknown }[];
    };
    const adminContent = admin.providers.find(
      (provider) => provider.provide === AdminContentService,
    )?.useValue as {
      dependencies: { media: { storage: unknown } };
    };
    expect(adminContent.dependencies.media.storage).toBeInstanceOf(
      S3AudioUploadProvider,
    );

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
