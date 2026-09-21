/** root가 학습·관리·운영 기능과 환경별 provider를 조립하는지 검증한다 */

import { IdentityAuthenticationService } from '@flex-thia/domain/identity/authentication.service';
import { PasswordlessAuthenticationService } from '@flex-thia/domain/identity/passwordless-authentication.service';

import { S3UploadProvider } from '@flex-thia/providers/aws/s3-upload.provider';
import { SqsJobQueue } from '@flex-thia/providers/aws/sqs-job.queue';

import { CognitoPasswordlessAuthenticationProvider } from '@flex-thia/providers/identity/cognito-passwordless-authentication.provider';

import { SesEmailChallengeSender } from '@flex-thia/providers/messaging/ses-email-challenge.sender';

import { describe, expect, it } from 'vitest';
import { createApplicationModule } from './app.module.js';
import { ContentProductionApplicationService } from './content-production/content-production.service.js';

describe('createApplicationModule 조립', () => {
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

    const contentProductionModule = application.imports?.[6] as {
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
