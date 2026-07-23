/** 공개 API 오류 응답의 직렬화 가능한 형태를 검증한다 */
import { describe, expect, it } from 'vitest';
import { problemDetailsSchema } from './problem.js';

describe('공개 오류 계약', () => {
  it('필드 오류를 포함한 RFC 9457 형태를 허용한다', () => {
    expect(
      problemDetailsSchema.parse({
        type: 'https://flex-thia.dev/problems/validation-error',
        title: '입력값이 올바르지 않습니다',
        status: 400,
        code: 'VALIDATION_ERROR',
        requestId: 'request-123',
        fieldErrors: [{ path: 'email', message: '이메일 형식이 아닙니다' }],
      }),
    ).toEqual({
      type: 'https://flex-thia.dev/problems/validation-error',
      title: '입력값이 올바르지 않습니다',
      status: 400,
      code: 'VALIDATION_ERROR',
      requestId: 'request-123',
      fieldErrors: [{ path: 'email', message: '이메일 형식이 아닙니다' }],
    });
  });

  it('공개하지 않은 오류 필드를 거부한다', () => {
    expect(() =>
      problemDetailsSchema.parse({
        type: 'https://flex-thia.dev/problems/validation-error',
        title: '입력값이 올바르지 않습니다',
        status: 400,
        code: 'VALIDATION_ERROR',
        requestId: 'request-123',
        fieldErrors: [],
        cause: 'internal detail',
      }),
    ).toThrow();
  });
});
