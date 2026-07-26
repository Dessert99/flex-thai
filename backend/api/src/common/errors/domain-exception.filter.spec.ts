/** 도메인 오류가 내부 정보를 숨긴 안정적인 HTTP 응답이 되는지 검증한다 */
import {
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  problemDetailsSchema,
  startEmailAuthenticationRequestSchema,
} from '@flex-thia/contracts';
import { WordbookPersistenceError } from '@flex-thia/database';
import {
  AuthDomainError,
  AuditLogError,
  ContentImportError,
  EmailChallengeError,
  IdentityDomainError,
  LearningDomainError,
  MediaAssetDomainError,
  QuestionAdminError,
  QuestionPublicationError,
  UserManagementError,
  VocabularyAdminError,
  VocabularyRelationsMergeAdminError,
  WordbookDomainError,
} from '@flex-thia/domain';
import { LearnerPublicResponseError } from '../../learning/learner-content.service.js';
import { LearnerQuestionsController } from '../../learning/learner-questions.controller.js';
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
          body: { storageKey: 'private/internal.mp3' },
        }),
        getResponse: () => ({ type, status, json }),
      }),
    } as never;
    const errors = [
      new InternalServerErrorException({
        code: 'INTERNAL_DETAIL',
        message: 'secret',
        issues: [{ path: ['storageKey'], message: 'Zod secret issue' }],
        storageKey: 'private/exception.mp3',
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

  it.each([
    'CONTENT_DRAFT_ITEM_CONFLICT',
    'CONTENT_DRAFT_PERSISTENCE_CONFLICT',
    'CONTENT_IMPORT_PERSISTENCE_CONFLICT',
    'MEDIA_ADMIN_PERSISTENCE_CONFLICT',
    'QUESTION_ADMIN_PERSISTENCE_CONFLICT',
    'QUESTION_PUBLICATION_PERSISTENCE_CONFLICT',
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

  it.each([
    [new ContentImportError('CONTENT_IMPORT_IDEMPOTENCY_CONFLICT'), 409],
    [new MediaAssetDomainError('MEDIA_UPLOAD_EMPTY'), 400],
    [new MediaAssetDomainError('MEDIA_UPLOAD_TOO_LARGE'), 413],
    [new MediaAssetDomainError('MEDIA_MIME_NOT_ALLOWED'), 400],
    [new MediaAssetDomainError('MEDIA_SHA256_INVALID'), 400],
    [new MediaAssetDomainError('MEDIA_ASSET_NOT_FOUND'), 404],
    [new MediaAssetDomainError('MEDIA_ASSET_NOT_UPLOADING'), 409],
    [new MediaAssetDomainError('MEDIA_INSPECTION_MISMATCH'), 409],
    [new QuestionAdminError('QUESTION_NOT_FOUND'), 404],
    [new QuestionAdminError('QUESTION_VERSION_NOT_FOUND'), 404],
    [new QuestionAdminError('QUESTION_TYPE_NOT_FOUND'), 404],
    [new QuestionAdminError('QUESTION_REFERENCE_NOT_FOUND'), 404],
    [new QuestionAdminError('QUESTION_MEDIA_NOT_READY'), 409],
    [new QuestionAdminError('QUESTION_CONTENT_INVALID'), 400],
    [new QuestionAdminError('IMMUTABLE_VERSION'), 409],
    [new QuestionPublicationError('QUESTION_NOT_FOUND'), 404],
    [new QuestionPublicationError('QUESTION_VERSION_NOT_FOUND'), 404],
    [new QuestionPublicationError('QUESTION_VERSION_NOT_PUBLISHABLE'), 409],
    [new QuestionPublicationError('QUESTION_STATE_CONFLICT'), 409],
    [new UserManagementError('ADMIN_REQUIRED'), 403],
    [new UserManagementError('INVALID_SCHOOL_EMAIL'), 400],
    [new UserManagementError('USER_NOT_FOUND'), 404],
    [new UserManagementError('SELF_LOCKOUT_FORBIDDEN'), 409],
    [new UserManagementError('LAST_ACTIVE_ADMIN_REQUIRED'), 409],
    [new AuditLogError('AUDIT_LOG_NOT_FOUND'), 404],
    [new VocabularyAdminError('VOCABULARY_NOT_FOUND'), 404],
    [new VocabularyAdminError('VOCABULARY_MEDIA_NOT_FOUND'), 404],
    [new VocabularyAdminError('VOCABULARY_CONTENT_INVALID'), 400],
    [new VocabularyAdminError('VOCABULARY_DUPLICATE'), 409],
    [new VocabularyAdminError('VOCABULARY_IN_USE'), 409],
    [new VocabularyAdminError('VOCABULARY_AUDIO_NOT_READY'), 409],
    [new VocabularyAdminError('VOCABULARY_STATE_CONFLICT'), 409],
    [new VocabularyRelationsMergeAdminError('MEANING_RELATION_NOT_FOUND'), 404],
    [new VocabularyRelationsMergeAdminError('MEANING_RELATION_DUPLICATE'), 409],
    [new VocabularyRelationsMergeAdminError('VOCABULARY_MERGE_CONFLICT'), 409],
  ] as const)(
    '관리자 domain 오류 %s를 정확한 공개 상태 %i로 변환한다',
    (error, status) => {
      const result = buildErrorResponse(error, 'request-admin');

      expect(result.status).toBe(status);
      expect(result.body).toMatchObject({
        status,
        code: error.code,
        requestId: 'request-admin',
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
      startEmailAuthenticationRequestSchema.parse({ email: 'invalid' });
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
