/** MVP root가 Identity·Learning과 health 경계만 조립하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  CloudFrontMediaReadUrlProvider,
  FakeAudioUploadProvider,
  FakeMediaReadUrlProvider,
  S3AudioUploadProvider,
} from '@flex-thia/providers';
import { AdminContentService } from './admin/admin-content.service.js';
import { AdminModule } from './admin/admin.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { LearnerContentService } from './learning/learner-content.service.js';
import { LearningModule } from './learning/learning.module.js';
import { createApplicationModule } from './app.module.js';

describe('createApplicationModule 조립', () => {
  it('로컬 설정에서 Identity·Learning·Admin과 health만 조립한다', () => {
    const application = createApplicationModule({
      NODE_ENV: 'test',
      AUTH_MODE: 'fake',
      DATABASE_MODE: 'local',
      DATABASE_URL: 'postgres://local/test',
    });

    expect(application.imports).toHaveLength(3);
    expect(application.imports?.[0]).toMatchObject({ module: IdentityModule });
    expect(application.imports?.[1]).toMatchObject({ module: LearningModule });
    expect(application.imports?.[2]).toMatchObject({ module: AdminModule });
    expect(application.controllers).toHaveLength(2);
    expect(
      application.controllers?.map(
        (controller) => (controller as { name: string }).name,
      ),
    ).toEqual(['HealthController', 'ReadinessController']);
    expect(application.providers).toHaveLength(1);

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
        mediaReadUrls: unknown;
      };
    };

    expect(content.dependencies.mediaReadUrls).toBeInstanceOf(
      FakeMediaReadUrlProvider,
    );
    expect(content.dependencies.questionQuery.database).toBe(
      content.dependencies.vocabularyQuery.database,
    );
    expect(content.dependencies.questionQuery.database).toBe(
      content.dependencies.questionAttempts.repository.database,
    );
    expect(content.dependencies.questionAttempts.repository).toBe(
      content.dependencies.savedContent.repository,
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
  });
});
