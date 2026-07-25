/** production에서 개발용 인증 우회를 차단하는 설정 테스트 */
import { describe, expect, it } from 'vitest';
import { readApiEnv } from './api-env.js';

describe('readApiEnv가 API 환경 변수를 검증한다', () => {
  it('production에서 fake 인증 모드를 거부한다', () => {
    expect(() =>
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'fake',
        DATABASE_MODE: 'data-api',
        AWS_REGION: 'ap-northeast-2',
      }),
    ).toThrow('production에서는 AUTH_MODE=fake를 사용할 수 없습니다');
  });

  it('production AWS adapter에 필요한 값을 시작 전에 모두 요구한다', () => {
    expect(() =>
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        AWS_REGION: 'ap-northeast-2',
      }),
    ).toThrow('production 필수 환경 변수가 누락되었습니다');
  });

  it('production DB·Cognito 값만 있고 media 설정이 없으면 시작을 거부한다', () => {
    expect(() =>
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        RDS_RESOURCE_ARN: 'resource-arn',
        RDS_SECRET_ARN: 'secret-arn',
        COGNITO_USER_POOL_ID: 'pool-id',
        COGNITO_CLIENT_ID: 'client-id',
      }),
    ).toThrow('production 필수 환경 변수가 누락되었습니다');
  });

  it('production은 MEDIA_BUCKET_NAME 누락 시 시작을 거부한다', () => {
    expect(() =>
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        RDS_RESOURCE_ARN: 'resource-arn',
        RDS_SECRET_ARN: 'secret-arn',
        COGNITO_USER_POOL_ID: 'pool-id',
        COGNITO_CLIENT_ID: 'client-id',
        MEDIA_CDN_BASE_URL: 'https://cdn.example.com/media',
        MEDIA_KEY_PAIR_ID: 'key-pair-id',
        MEDIA_PRIVATE_KEY_SECRET_ARN: 'media-secret-arn',
      }),
    ).toThrow('production 필수 환경 변수가 누락되었습니다');
  });

  it('production은 DB·Cognito·media 연결 값이 모두 있으면 시작할 수 있다', () => {
    expect(
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        RDS_RESOURCE_ARN: 'resource-arn',
        RDS_SECRET_ARN: 'secret-arn',
        COGNITO_USER_POOL_ID: 'pool-id',
        COGNITO_CLIENT_ID: 'client-id',
        MEDIA_CDN_BASE_URL: 'https://cdn.example.com/media',
        MEDIA_KEY_PAIR_ID: 'key-pair-id',
        MEDIA_PRIVATE_KEY_SECRET_ARN: 'media-secret-arn',
        MEDIA_BUCKET_NAME: 'media-bucket',
      }),
    ).toMatchObject({
      RDS_RESOURCE_ARN: 'resource-arn',
      COGNITO_USER_POOL_ID: 'pool-id',
      MEDIA_CDN_BASE_URL: 'https://cdn.example.com/media',
      MEDIA_KEY_PAIR_ID: 'key-pair-id',
      MEDIA_PRIVATE_KEY_SECRET_ARN: 'media-secret-arn',
      MEDIA_BUCKET_NAME: 'media-bucket',
    });
  });

  it('production media CDN은 HTTPS URL만 허용한다', () => {
    expect(() =>
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        RDS_RESOURCE_ARN: 'resource-arn',
        RDS_SECRET_ARN: 'secret-arn',
        COGNITO_USER_POOL_ID: 'pool-id',
        COGNITO_CLIENT_ID: 'client-id',
        MEDIA_CDN_BASE_URL: 'http://cdn.example.com/media',
        MEDIA_KEY_PAIR_ID: 'key-pair-id',
        MEDIA_PRIVATE_KEY_SECRET_ARN: 'media-secret-arn',
        MEDIA_BUCKET_NAME: 'media-bucket',
      }),
    ).toThrow('production MEDIA_CDN_BASE_URL은 HTTPS여야 합니다');
  });

  it('development와 test에는 fake media provider용 기본값을 제공한다', () => {
    expect(readApiEnv({ NODE_ENV: 'development' })).toMatchObject({
      MEDIA_CDN_BASE_URL: 'https://fake-media.invalid/media',
      MEDIA_KEY_PAIR_ID: 'local-fake-key-pair',
      MEDIA_PRIVATE_KEY_SECRET_ARN: 'local-fake-media-secret',
      MEDIA_BUCKET_NAME: 'local-fake-media-bucket',
    });
    expect(readApiEnv({ NODE_ENV: 'test' })).toMatchObject({
      MEDIA_CDN_BASE_URL: 'https://fake-media.invalid/media',
      MEDIA_KEY_PAIR_ID: 'local-fake-key-pair',
      MEDIA_PRIVATE_KEY_SECRET_ARN: 'local-fake-media-secret',
      MEDIA_BUCKET_NAME: 'local-fake-media-bucket',
    });
  });

  it('local fake 관리자와 학생 계정 기본값을 제공한다', () => {
    expect(readApiEnv({})).toMatchObject({
      FAKE_USER_SUB: 'local-admin-sub',
      FAKE_USER_EMAIL: 'admin@hufs.ac.kr',
      FAKE_USER_PASSWORD: 'qwer1234!@#',
      FAKE_LEARNER_SUB: 'local-learner-sub',
      FAKE_LEARNER_EMAIL: 'learner@hufs.ac.kr',
      FAKE_LEARNER_PASSWORD: 'qwer1234!@#',
    });
  });
});
