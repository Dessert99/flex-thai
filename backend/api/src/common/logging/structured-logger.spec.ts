/** 구조화 로그에서 인증 정보와 개인정보가 제거되는지 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { StructuredLogger } from './structured-logger.js';

describe('StructuredLogger 민감 정보 제거', () => {
  it('Nest context와 plain metadata를 숫자 key 없이 구조화한다', () => {
    const write = vi.fn();
    const logger = new StructuredLogger('api', write);

    logger.log('ready', 'NestContext', { requestId: 'request-1' });

    const entry = JSON.parse(write.mock.calls[0]?.[0] as string) as Record<
      string,
      unknown
    >;
    expect(Object.keys(entry)).not.toContain('0');
    expect(entry).toEqual({
      context: 'NestContext',
      level: 'info',
      message: 'ready',
      requestId: 'request-1',
      service: 'api',
    });
  });

  it('Nest error stack과 Error message를 버리고 context와 Error name만 남긴다', () => {
    const write = vi.fn();
    const logger = new StructuredLogger('api', write);
    const rawStack = 'Error: request stack';

    logger.error(
      'failed',
      rawStack,
      'NestContext',
      new Error('password=secret'),
    );

    const serialized = write.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(serialized) as Record<string, unknown>;
    expect(Object.keys(entry)).not.toContain('0');
    expect(entry).toMatchObject({
      context: 'NestContext',
      errorName: 'Error',
      level: 'error',
      message: 'failed',
      service: 'api',
    });
    expect(serialized).not.toContain(rawStack);
    expect(serialized).not.toContain('password=secret');
  });

  it('array·Date·Error optional parameter를 plain metadata로 펼치지 않는다', () => {
    const write = vi.fn();
    const logger = new StructuredLogger('api', write);

    logger.warn(
      'warning',
      ['metadata'],
      new Date('2026-07-31T00:00:00.000Z'),
      new Error('token=secret'),
      { requestId: 'request-1' },
    );

    const serialized = write.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(serialized) as Record<string, unknown>;
    expect(Object.keys(entry)).not.toContain('0');
    expect(entry).toMatchObject({
      errorName: 'Error',
      requestId: 'request-1',
    });
    expect(serialized).not.toContain('token=secret');
  });

  it('민감한 key는 중첩 위치와 관계없이 로그에 남기지 않는다', () => {
    const write = vi.fn();
    const logger = new StructuredLogger('api', write);

    logger.error('요청 실패', {
      requestId: 'request-1',
      errorCode: 'AUTH_FAILED',
      jobId: 'job-1',
      route: '/api/v1/questions/:questionId',
      userId: 'user-1',
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
        sensitive: {
          PassWord: 'nested-password-secret',
          tOtP: 'nested-totp-secret',
          rawJSON: { answer: 'nested-raw-json-secret' },
          StorageKey: 'private/nested-storage-key-secret.mp3',
        },
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
      route: '/api/v1/questions/:questionId',
      userId: 'user-1',
    });
    expect(normalized).not.toMatch(
      /authorization|cookie|password|totp|rawjson|storagekey|email|phonenumber|otp|token|secret|123456/u,
    );
  });
});
