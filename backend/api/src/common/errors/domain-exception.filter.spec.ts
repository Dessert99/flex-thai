/** 도메인 오류가 내부 정보를 숨긴 안정적인 HTTP 응답이 되는지 검증한다 */
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { loginRequestSchema, problemDetailsSchema } from '@flex-thia/contracts';
import {
  AuthDomainError,
  IdentityDomainError,
  LearningDomainError,
} from '@flex-thia/domain';
import {
  buildErrorResponse,
  DomainExceptionFilter,
} from './domain-exception.filter.js';

describe('buildErrorResponse', () => {
  it('production 응답에는 stack 없이 code와 request id만 남긴다', () => {
    const error = new AuthDomainError('STEP_UP_INVALID');
    error.stack = 'sensitive stack';

    const result = buildErrorResponse(error, 'request-1');

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
    );

    expect(result.body.code).toBe('DB_RESUMING');
  });

  it('Identity 오류와 Zod 오류를 problem details 계약으로 변환한다', () => {
    const identity = buildErrorResponse(
      new IdentityDomainError('INVALID_CREDENTIALS'),
      'request-3',
    );
    const zodError = (() => {
      try {
        loginRequestSchema.parse({ email: 'invalid', password: '' });
      } catch (error) {
        return error;
      }
    })();
    const invalidBody = buildErrorResponse(zodError, 'request-4');

    expect(problemDetailsSchema.parse(identity.body)).toEqual(identity.body);
    expect(identity.status).toBe(401);
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.fieldErrors.length).toBeGreaterThan(0);
  });

  it.each([
    ['QUESTION_UNAVAILABLE', 409],
    ['QUESTION_OPTION_MISMATCH', 409],
    ['ATTEMPT_IDEMPOTENCY_CONFLICT', 409],
    ['VOCABULARY_UNAVAILABLE', 404],
  ] as const)(
    '학습 오류 %s를 exact public status %i로 변환한다',
    (code, status) => {
      const result = buildErrorResponse(
        new LearningDomainError(code),
        'request-learning',
      );

      expect(result).toEqual({
        status,
        body: {
          type: `https://flex-thia.example/problems/${code.toLowerCase().replaceAll('_', '-')}`,
          title: '요청을 처리할 수 없습니다.',
          status,
          code,
          requestId: 'request-learning',
          fieldErrors: [],
        },
      });
    },
  );

  it('공개 query null의 stable 404 code를 보존한다', () => {
    const question = buildErrorResponse(
      new NotFoundException({ code: 'QUESTION_NOT_FOUND' }),
      'request-question',
    );
    const vocabulary = buildErrorResponse(
      new NotFoundException({ code: 'VOCABULARY_NOT_FOUND' }),
      'request-vocabulary',
    );

    expect(question).toMatchObject({
      status: 404,
      body: { code: 'QUESTION_NOT_FOUND' },
    });
    expect(vocabulary).toMatchObject({
      status: 404,
      body: { code: 'VOCABULARY_NOT_FOUND' },
    });
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
