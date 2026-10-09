/** production에서 개발용 인증 우회를 차단하는 설정 테스트 */
import { describe, expect, it } from 'vitest';
import { readApiEnv } from './api-env.js';

describe('readApiEnv가 API 환경 변수를 검증한다', () => {
  it('자동 로그인은 명시적으로 켜야 활성화된다', () => {
    expect(readApiEnv({}).LOCAL_AUTO_LOGIN).toBe(false);
    expect(readApiEnv({ LOCAL_AUTO_LOGIN: 'false' }).LOCAL_AUTO_LOGIN).toBe(
      false,
    );
    expect(readApiEnv({ LOCAL_AUTO_LOGIN: 'true' }).LOCAL_AUTO_LOGIN).toBe(
      true,
    );
  });

  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: 'test' },
    { AUTH_MODE: 'cognito' },
    { DATABASE_MODE: 'data-api' },
  ])('로컬 개발 조건을 벗어나면 자동 로그인을 거부한다: %j', (config) => {
    expect(() => readApiEnv({ ...config, LOCAL_AUTO_LOGIN: 'true' })).toThrow(
      '자동 로그인은 development의 fake 인증과 local DB에서만 사용할 수 있습니다',
    );
  });

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

  it('production passwordless 보안 값이 빠지면 시작을 거부한다', () => {
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

  it('production은 로컬 기본 challenge pepper로 시작하지 않는다', () => {
    expect(() =>
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        RDS_RESOURCE_ARN: 'resource-arn',
        RDS_SECRET_ARN: 'secret-arn',
        COGNITO_USER_POOL_ID: 'pool-id',
        COGNITO_CLIENT_ID: 'client-id',
        CUSTOM_AUTH_SECRET: 'C'.repeat(32),
        EMAIL_LINK_CONFIRMATION_URL: 'https://www.example.com/login/confirm',
        FROM_EMAIL: 'login@example.com',
      }),
    ).toThrow(
      'production CHALLENGE_HMAC_PEPPER가 안전하게 설정되지 않았습니다',
    );
  });

  it('production은 인증 secret 평문만 전달하면 시작하지 않는다', () => {
    expect(() =>
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        RDS_RESOURCE_ARN: 'resource-arn',
        RDS_SECRET_ARN: 'secret-arn',
        COGNITO_USER_POOL_ID: 'pool-id',
        COGNITO_CLIENT_ID: 'client-id',
        CUSTOM_AUTH_SECRET: 'C'.repeat(32),
        CHALLENGE_HMAC_PEPPER: 'P'.repeat(32),
        EMAIL_LINK_CONFIRMATION_URL: 'https://www.example.com/login/confirm',
        FROM_EMAIL: 'login@example.com',
      }),
    ).toThrow('production 인증 secret ARN이 누락되었습니다');
  });

  it('production 이메일 확인 링크는 HTTPS URL만 허용한다', () => {
    expect(() =>
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        RDS_RESOURCE_ARN: 'resource-arn',
        RDS_SECRET_ARN: 'secret-arn',
        COGNITO_USER_POOL_ID: 'pool-id',
        COGNITO_CLIENT_ID: 'client-id',
        CUSTOM_AUTH_SECRET: 'C'.repeat(32),
        CHALLENGE_HMAC_PEPPER: 'P'.repeat(32),
        EMAIL_LINK_CONFIRMATION_URL: 'http://www.example.com/login/confirm',
        FROM_EMAIL: 'login@example.com',
      }),
    ).toThrow('production EMAIL_LINK_CONFIRMATION_URL은 HTTPS여야 합니다');
  });

  it('local fake 학습자 계정 기본값을 제공한다', () => {
    const env = readApiEnv({});
    expect(env).toMatchObject({
      FAKE_LEARNER_SUB: 'local-learner-sub',
      FAKE_LEARNER_EMAIL: 'learner@hufs.ac.kr',
      CHALLENGE_HMAC_PEPPER: 'local-only-email-challenge-pepper',
      EMAIL_LINK_CONFIRMATION_URL: 'http://localhost:5173/login/confirm',
    });
    expect(env).not.toHaveProperty('AUTH_LIMIT_PARAMETER_PREFIX');
  });

  it('사용하지 않는 legacy SSM 인증 제한 설정을 공개하지 않는다', () => {
    expect(
      readApiEnv({
        AUTH_LIMIT_PARAMETER_PREFIX: '/legacy/auth',
      }),
    ).not.toHaveProperty('AUTH_LIMIT_PARAMETER_PREFIX');
  });
});
