/** production에서 개발용 인증 우회를 차단하는 설정 테스트 */
import { describe, expect, it } from 'vitest';
import { readApiEnv } from './api-env.js';

describe('readApiEnv', () => {
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

  it('production은 DB와 Cognito 연결 값만 있으면 시작할 수 있다', () => {
    expect(
      readApiEnv({
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        DATABASE_MODE: 'data-api',
        RDS_RESOURCE_ARN: 'resource-arn',
        RDS_SECRET_ARN: 'secret-arn',
        COGNITO_USER_POOL_ID: 'pool-id',
        COGNITO_CLIENT_ID: 'client-id',
      }),
    ).toMatchObject({
      RDS_RESOURCE_ARN: 'resource-arn',
      COGNITO_USER_POOL_ID: 'pool-id',
    });
  });

  it('local fake 관리자 비밀번호 기본값을 제공한다', () => {
    expect(readApiEnv({}).FAKE_USER_PASSWORD).toBe('LocalOnly1!');
  });
});
