/** API 오류가 안전한 메시지와 구분 가능한 detail만 노출하는지 검증한다 */
import { describe, expect, it } from 'vitest';
import { ApiError } from './ApiError';

describe('ApiError', () => {
  it('서버 title 원문을 Error message에 노출하지 않는다', () => {
    const error = new ApiError({
      kind: 'problem',
      problem: {
        type: 'https://flex-thia.dev/problems/internal-error',
        title: '내부 저장소 연결 문자열이 잘못되었습니다',
        status: 500,
        code: 'INTERNAL_ERROR',
        requestId: 'request-123',
        fieldErrors: [],
      },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain('연결 문자열');
    expect(error.detail.kind).toBe('problem');
  });

  it('네트워크 오류를 별도 detail로 유지한다', () => {
    const error = new ApiError({ kind: 'network' });

    expect(error.name).toBe('ApiError');
    expect(error.detail).toEqual({ kind: 'network' });
  });
});
