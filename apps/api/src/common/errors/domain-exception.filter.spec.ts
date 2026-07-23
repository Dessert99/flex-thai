/** 도메인 오류가 내부 정보를 숨긴 안정적인 HTTP 응답이 되는지 검증한다 */
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { loginRequestSchema, problemDetailsSchema } from '@flex-thia/contracts';
import { AuthDomainError, IdentityDomainError } from '@flex-thia/domain';
import {
  buildErrorResponse,
  DomainExceptionFilter,
} from './domain-exception.filter.js';

describe('buildErrorResponse', () => {
  it('production 응답에는 stack 없이 code와 request id만 남긴다', () => {
    const error = new AuthDomainError('STEP_UP_INVALID');
    error.stack = 'sensitive stack';

    const result = buildErrorResponse(error, 'request-1', true);

    expect(result).toEqual({
      status: 401,
      body: {
        type: 'https://flex-thia.example/problems/step-up-invalid',
        title: '요청을 처리할 수 없습니다.',
        status: 401,
        code: 'STEP_UP_INVALID',
        requestId: 'request-1',
        fieldErrors: [],
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

  it('Identity 오류와 Zod 오류를 problem details 계약으로 변환한다', () => {
    const identity = buildErrorResponse(
      new IdentityDomainError('INVALID_CREDENTIALS'),
      'request-3',
      true,
    );
    const zodError = (() => {
      try {
        loginRequestSchema.parse({ email: 'invalid', password: '' });
      } catch (error) {
        return error;
      }
    })();
    const invalidBody = buildErrorResponse(zodError, 'request-4', true);

    expect(problemDetailsSchema.parse(identity.body)).toEqual(identity.body);
    expect(identity.status).toBe(401);
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.fieldErrors.length).toBeGreaterThan(0);
  });

  it('filter는 application/problem+json content type으로 응답한다', () => {
    const type = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const filter = new DomainExceptionFilter({ error: vi.fn() } as never);

    filter.catch(new IdentityDomainError('INVALID_TOTP'), {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-request-id': 'request-5' } }),
        getResponse: () => ({ type, status, json }),
      }),
    } as never);

    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(status).toHaveBeenCalledWith(401);
  });
});
