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
});
