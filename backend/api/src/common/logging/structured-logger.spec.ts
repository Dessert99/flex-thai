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
      Authorization: 'Bearer authorization-secret',
      COOKIE: 'refresh_token=cookie-secret',
      PassWord: 'password-secret',
      tOtP: 'totp-secret',
      rawJSON: { answer: 'raw-json-secret' },
      nested: {
        email: 'admin@hufs.ac.kr',
        phoneNumber: '+821012345678',
        otp: '123456',
        token: 'secret',
        StorageKey: 'private/storage-key-secret.mp3',
      },
    });

    const serialized = write.mock.calls[0]?.[0] as string;
    const normalized = serialized.toLowerCase();
    const entry = JSON.parse(serialized) as Record<string, unknown>;

    expect(entry).toMatchObject({
      level: 'error',
      service: 'api',
      message: '요청 실패',
      requestId: 'request-1',
      errorCode: 'AUTH_FAILED',
      jobId: 'job-1',
    });
    expect(normalized).not.toMatch(
      /authorization|cookie|password|totp|rawjson|storagekey|email|phonenumber|otp|token|secret|123456/u,
    );
  });
});
