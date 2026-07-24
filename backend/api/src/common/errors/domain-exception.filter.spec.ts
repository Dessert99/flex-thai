/** 도메인 오류가 내부 정보를 숨긴 안정적인 HTTP 응답이 되는지 검증한다 */
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { loginRequestSchema, problemDetailsSchema } from '@flex-thia/contracts';
import {
  AuthDomainError,
  IdentityDomainError,
  LearningDomainError,
} from '@flex-thia/domain';
import { LearnerPublicResponseError } from '../../learning/learner-content.service.js';
import { LearnerQuestionsController } from '../../learning/learner-questions.controller.js';
import { StructuredLogger } from '../logging/structured-logger.js';
import {
  buildErrorResponse,
  DomainExceptionFilter,
} from './domain-exception.filter.js';

describe('공개 오류 응답 변환', () => {
  it('운영 응답에는 stack 없이 code와 request id만 남긴다', () => {
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

  it('준비 상태의 공개 code를 일반 HTTP 이름으로 덮어쓰지 않는다', () => {
    const result = buildErrorResponse(
      new ServiceUnavailableException({ code: 'DB_RESUMING' }),
      'request-2',
    );

    expect(result.body.code).toBe('DB_RESUMING');
  });

  it('Identity 오류와 요청 Zod 오류를 Problem Details 계약으로 변환한다', () => {
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
    '학습 오류 %s를 정확한 공개 상태 %i로 변환한다',
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

  it('공개 query null의 안정적인 404 code를 보존한다', () => {
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

  it('예상한 4xx는 application/problem+json으로 응답하고 오류 로그를 남기지 않는다', () => {
    const type = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const errorLog = vi.fn();
    const filter = new DomainExceptionFilter({ error: errorLog } as never);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-request-id': 'request-5' } }),
        getResponse: () => ({ type, status, json }),
      }),
    } as never;
    let requestError: unknown;
    try {
      loginRequestSchema.parse({ email: 'invalid', password: '' });
    } catch (error) {
      requestError = error;
    }

    filter.catch(new IdentityDomainError('INVALID_TOTP'), host);
    filter.catch(requestError, host);
    filter.catch(new LearningDomainError('QUESTION_UNAVAILABLE'), host);

    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(status).toHaveBeenCalledWith(401);
    expect(status).toHaveBeenCalledWith(400);
    expect(status).toHaveBeenCalledWith(409);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('실제 Controller 응답 검증 실패는 내부 필드 없이 500으로 응답하고 안전한 요청 문맥만 기록한다', async () => {
    const controller = new LearnerQuestionsController({
      listQuestions: () =>
        Promise.resolve({
          items: [],
          page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
          storageKey: 'private/leak.mp3',
        }),
    } as never);
    let responseError: unknown;
    try {
      await controller.listQuestions(
        {
          userId: 'user-1',
          sub: 'subject-1',
          email: 'learner@example.com',
          role: 'LEARNER',
          mfaEnrolledAt: null,
        },
        {},
      );
    } catch (error) {
      responseError = error;
    }
    expect(responseError).toBeInstanceOf(LearnerPublicResponseError);

    const type = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const write = vi.fn();
    const filter = new DomainExceptionFilter(
      new StructuredLogger('api', write),
    );

    filter.catch(responseError, {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-request-id': 'request-response',
            authorization: 'Bearer secret-token',
          },
          route: { path: '/api/v1/questions' },
          user: { userId: 'user-1' },
          body: { storageKey: 'private/leak.mp3' },
        }),
        getResponse: () => ({ type, status, json }),
      }),
    } as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      type: 'https://flex-thia.example/problems/internal-server-error',
      title: '요청을 처리할 수 없습니다.',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      requestId: 'request-response',
      fieldErrors: [],
    });
    const serialized = write.mock.calls[0]?.[0] as string;
    expect(JSON.parse(serialized)).toMatchObject({
      level: 'error',
      requestId: 'request-response',
      errorCode: 'INTERNAL_SERVER_ERROR',
      route: '/api/v1/questions',
      userId: 'user-1',
    });
    expect(serialized).not.toMatch(
      /storageKey|private\/leak|authorization|secret-token|Zod/u,
    );
  });
});
