/** 도메인 오류가 내부 정보를 숨긴 안정적인 HTTP 응답이 되는지 검증한다 */
import { problemDetailsSchema } from '@flex-thia/contracts/common/problem';
import { startEmailAuthenticationRequestSchema } from '@flex-thia/contracts/identity/auth';
import { WordbookPersistenceError } from '@flex-thia/database/repositories/drizzle-wordbook.repository';
import { AuthDomainError } from '@flex-thia/domain/auth/auth-domain.error';

import { IdentityDomainError } from '@flex-thia/domain/identity/authentication.service';
import { EmailChallengeError } from '@flex-thia/domain/identity/email-challenge';

import { WordbookDomainError } from '@flex-thia/domain/learning/wordbook';

import {
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { StructuredLogger } from '../logging/structured-logger.js';
import {
  buildErrorResponse,
  DomainExceptionFilter,
} from './domain-exception.filter.js';

describe('공개 오류 응답 변환', () => {
  it.each([
    ['INVALID_SCHOOL_EMAIL', 400],
    ['CHALLENGE_NOT_FOUND', 404],
    ['CHALLENGE_EXPIRED', 401],
    ['CHALLENGE_ALREADY_USED', 409],
    ['CHALLENGE_IN_PROGRESS', 409],
    ['INVALID_CHALLENGE_ANSWER', 401],
    ['CHALLENGE_ATTEMPTS_EXCEEDED', 401],
    ['CHALLENGE_RESEND_COOLDOWN', 429],
    ['EMAIL_DAILY_LIMIT_EXCEEDED', 429],
    ['GLOBAL_DAILY_LIMIT_EXCEEDED', 429],
  ] as const)(
    '이메일 challenge 오류 %s를 공개 상태 %i로 변환한다',
    (code, status) => {
      const result = buildErrorResponse(
        new EmailChallengeError(code),
        'request-challenge',
      );

      expect(result).toMatchObject({
        status,
        body: { code, status, requestId: 'request-challenge' },
      });
    },
  );

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

  it('번역되지 않은 PostgreSQL unique 오류는 500으로 유지한다', () => {
    const result = buildErrorResponse(
      {
        code: '23505',
        constraint: 'question_type_versions_type_version_unique',
      },
      'request-taxonomy',
    );

    expect(result).toMatchObject({
      status: 500,
      body: {
        code: 'INTERNAL_SERVER_ERROR',
        requestId: 'request-taxonomy',
      },
    });
  });

  it('준비 상태의 공개 code를 일반 HTTP 이름으로 덮어쓰지 않는다', () => {
    const result = buildErrorResponse(
      new ServiceUnavailableException({ code: 'DB_RESUMING' }),
      'request-2',
    );

    expect(result.body.code).toBe('DB_RESUMING');
  });

  it('모든 500 HttpException을 generic 응답으로 숨기고 안전한 요청 문맥만 기록한다', () => {
    const type = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const write = vi.fn();
    const filter = new DomainExceptionFilter(
      new StructuredLogger('api', write),
    );
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-request-id': 'request-internal',
            authorization: 'Bearer secret-token',
          },
          route: { path: '/api/v1/questions/:questionId' },
          user: { userId: 'user-internal' },
          body: { storageKey: 'private/internal.bin' },
        }),
        getResponse: () => ({ type, status, json }),
      }),
    } as never;
    const errors = [
      new InternalServerErrorException({
        code: 'INTERNAL_DETAIL',
        message: 'secret',
        issues: [{ path: ['storageKey'], message: 'Zod secret issue' }],
        storageKey: 'private/exception.bin',
        token: 'exception-secret-token',
      }),
      new HttpException(
        { code: 'PLAIN_INTERNAL_DETAIL', message: 'plain-secret' },
        500,
      ),
    ];

    errors.forEach((error) => filter.catch(error, host));

    expect(status).toHaveBeenNthCalledWith(1, 500);
    expect(status).toHaveBeenNthCalledWith(2, 500);
    json.mock.calls.forEach(([body]) => {
      expect(body).toEqual({
        type: 'https://flex-thia.example/problems/internal-server-error',
        title: '요청을 처리할 수 없습니다.',
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        requestId: 'request-internal',
        fieldErrors: [],
      });
    });
    expect(write).toHaveBeenCalledTimes(2);
    const serializedLogs = write.mock.calls.map(([serialized]) =>
      String(serialized),
    );
    serializedLogs.forEach((serialized) => {
      expect(JSON.parse(serialized)).toMatchObject({
        level: 'error',
        requestId: 'request-internal',
        errorCode: 'INTERNAL_SERVER_ERROR',
        route: '/api/v1/questions/:questionId',
        userId: 'user-internal',
      });
    });
    expect(JSON.stringify(json.mock.calls)).not.toMatch(
      /INTERNAL_DETAIL|secret|Zod|storageKey|private\/internal|private\/exception|token/u,
    );
    expect(serializedLogs.join(' ')).not.toMatch(
      /INTERNAL_DETAIL|secret|Zod|storageKey|private\/internal|private\/exception|authorization|token/u,
    );
  });

  it('Identity 오류와 요청 Zod 오류를 Problem Details 계약으로 변환한다', () => {
    const identity = buildErrorResponse(
      new IdentityDomainError('INVALID_CREDENTIALS'),
      'request-3',
    );
    const zodError = (() => {
      try {
        startEmailAuthenticationRequestSchema.parse({ email: 'invalid' });
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
    'CONTENT_DRAFT_ITEM_CONFLICT',
    'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
    'CONTENT_IMPORT_PERSISTENCE_CONFLICT',
  ])('관리자 persistence 충돌 %s를 409로 변환한다', (code) => {
    const result = buildErrorResponse({ code }, 'request-persistence');

    expect(result).toMatchObject({
      status: 409,
      body: { code, status: 409, requestId: 'request-persistence' },
    });
  });

  it.each([
    [new WordbookDomainError('WORDBOOK_NAME_INVALID'), 400],
    [new WordbookDomainError('WORDBOOK_NOT_FOUND'), 404],
    [new WordbookDomainError('WORDBOOK_SAME_TARGET'), 400],
    [new WordbookDomainError('VOCABULARY_UNAVAILABLE'), 404],
    [new WordbookPersistenceError('WORDBOOK_NAME_CONFLICT', 'create'), 409],
    [
      new WordbookPersistenceError('WORDBOOK_PERSISTENCE_CONFLICT', 'create'),
      409,
    ],
  ] as const)(
    '단어장 오류 %s를 정확한 공개 상태 %i로 변환한다',
    (error, status) => {
      const result = buildErrorResponse(error, 'request-wordbook');

      expect(result).toMatchObject({
        status,
        body: {
          code: error.code,
          status,
          requestId: 'request-wordbook',
        },
      });
    },
  );

  it('공개 query null의 안정적인 404 code를 보존한다', () => {
    const vocabulary = buildErrorResponse(
      new NotFoundException({ code: 'VOCABULARY_NOT_FOUND' }),
      'request-vocabulary',
    );

    expect(vocabulary).toMatchObject({
      status: 404,
      body: { code: 'VOCABULARY_NOT_FOUND' },
    });
  });
});
