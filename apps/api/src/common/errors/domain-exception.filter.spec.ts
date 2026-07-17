/** 도메인 오류가 내부 정보를 숨긴 안정적인 HTTP 응답이 되는지 검증한다 */
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthDomainError } from '@flex-thia/domain';
import { buildErrorResponse } from './domain-exception.filter.js';

describe('buildErrorResponse', () => {
  it('production 응답에는 stack 없이 code와 request id만 남긴다', () => {
    const error = new AuthDomainError('STEP_UP_INVALID');
    error.stack = 'sensitive stack';

    const result = buildErrorResponse(error, 'request-1', true);

    expect(result).toEqual({
      status: 401,
      body: {
        code: 'STEP_UP_INVALID',
        message: 'STEP_UP_INVALID',
        requestId: 'request-1',
      },
    });
    expect(JSON.stringify(result)).not.toContain('sensitive stack');
  });

  it('readiness의 공개 code를 일반 HTTP 이름으로 덮어쓰지 않는다', () => {
    const result = buildErrorResponse(
      new ServiceUnavailableException({ code: 'DB_RESUMING' }),
      'request-2',
      true,
    );

    expect(result.body.code).toBe('DB_RESUMING');
  });
});
