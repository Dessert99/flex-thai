/** 구조화 로그에서 인증 정보와 개인정보가 제거되는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { StructuredLogger } from './structured-logger.js';

describe('StructuredLogger', () => {
  it('민감한 key는 중첩 위치와 관계없이 로그에 남기지 않는다', () => {
    const write = vi.fn();
    const logger = new StructuredLogger('api', write);

    logger.error('요청 실패', {
      requestId: 'request-1',
      errorCode: 'AUTH_FAILED',
      jobId: 'job-1',
      authorization: 'Bearer secret',
      cookie: 'refresh_token=secret',
      nested: {
        email: 'admin@hufs.ac.kr',
        phoneNumber: '+821012345678',
        otp: '123456',
        token: 'secret',
      },
    });

    const serialized = write.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(serialized) as Record<string, unknown>;

    expect(entry).toMatchObject({
      level: 'error',
      service: 'api',
      message: '요청 실패',
      requestId: 'request-1',
      errorCode: 'AUTH_FAILED',
      jobId: 'job-1',
    });
    expect(serialized).not.toMatch(
      /authorization|cookie|email|phoneNumber|otp|token|secret|123456/u,
    );
  });
});
