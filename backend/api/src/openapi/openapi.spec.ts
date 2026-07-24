/** 활성 API의 OpenAPI 경로·계약·보안 metadata를 검증한다 */
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApplicationModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import {
  configureOpenApi,
  createOpenApiDocument,
  resolveOpenApiPaths,
} from './openapi.js';

const ACTIVE_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/mfa/totp/challenge',
  '/api/v1/auth/mfa/totp/setup',
  '/api/v1/auth/mfa/totp/setup/verify',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/me',
  '/api/v1/me/question-attempts',
  '/api/v1/me/saved-questions/{questionId}',
  '/api/v1/me/saved-vocabularies',
  '/api/v1/me/saved-vocabularies/{vocabularyId}',
  '/api/v1/questions',
  '/api/v1/questions/{questionId}',
  '/api/v1/questions/{questionId}/attempts',
  '/api/v1/vocabularies',
  '/api/v1/vocabularies/{vocabularyId}',
  '/api/v1/vocabularies/{vocabularyId}/questions',
  '/health',
  '/ready',
];

type LearnerOperationExpectation = {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  pathParameters?: readonly string[];
  query?: readonly string[];
  body?: string;
  success: readonly [status: string, dto?: string];
  errors: readonly string[];
};

const LEARNER_OPERATIONS: readonly LearnerOperationExpectation[] = [
  {
    method: 'get',
    path: '/api/v1/questions',
    query: [
      'skill',
      'questionTypeId',
      'difficulty',
      'saved',
      'firstResult',
      'page',
      'pageSize',
    ],
    success: ['200', 'QuestionListResponseDto'],
    errors: ['400', '401', '403', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/questions/{questionId}',
    pathParameters: ['questionId'],
    success: ['200', 'QuestionDetailResponseDto'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/questions/{questionId}/attempts',
    pathParameters: ['questionId'],
    body: 'SubmitQuestionAttemptRequestDto',
    success: ['201', 'SubmitQuestionAttemptResponseDto'],
    errors: ['400', '401', '403', '409', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/me/question-attempts',
    query: ['page', 'pageSize'],
    success: ['200', 'QuestionAttemptListResponseDto'],
    errors: ['400', '401', '403', '500'],
  },
  {
    method: 'put',
    path: '/api/v1/me/saved-questions/{questionId}',
    pathParameters: ['questionId'],
    success: ['204'],
    errors: ['400', '401', '403', '409', '500'],
  },
  {
    method: 'delete',
    path: '/api/v1/me/saved-questions/{questionId}',
    pathParameters: ['questionId'],
    success: ['204'],
    errors: ['400', '401', '403', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/vocabularies',
    query: ['query', 'kind', 'partOfSpeech', 'difficulty', 'page', 'pageSize'],
    success: ['200', 'VocabularyListResponseDto'],
    errors: ['400', '401', '403', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/vocabularies/{vocabularyId}',
    pathParameters: ['vocabularyId'],
    success: ['200', 'VocabularyDetailResponseDto'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/vocabularies/{vocabularyId}/questions',
    pathParameters: ['vocabularyId'],
    query: ['page', 'pageSize'],
    success: ['200', 'VocabularyRelatedQuestionsResponseDto'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/me/saved-vocabularies',
    query: ['page', 'pageSize'],
    success: ['200', 'SavedVocabularyListResponseDto'],
    errors: ['400', '401', '403', '500'],
  },
  {
    method: 'put',
    path: '/api/v1/me/saved-vocabularies/{vocabularyId}',
    pathParameters: ['vocabularyId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'delete',
    path: '/api/v1/me/saved-vocabularies/{vocabularyId}',
    pathParameters: ['vocabularyId'],
    success: ['204'],
    errors: ['400', '401', '403', '500'],
  },
];

describe('OpenAPI 문서', () => {
  let app: INestApplication | undefined;

  beforeEach(async () => {
    app = await NestFactory.create(
      createApplicationModule({
        NODE_ENV: 'test',
        AUTH_MODE: 'fake',
        DATABASE_MODE: 'local',
        DATABASE_URL: 'postgres://local/test',
      }),
      { abortOnError: false, logger: false },
    );
    configureApp(app, ['http://localhost:5173']);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('현재 활성 endpoint의 서로 다른 path 열아홉 개만 공개한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(Object.keys(document.paths).sort()).toEqual(ACTIVE_PATHS.sort());
    expect(document.paths).not.toHaveProperty('/api/v1/jobs');
    expect(document.paths).not.toHaveProperty('/api/v1/uploads/policies');
  });

  it('로그인 요청·응답과 Problem Details schema를 공개한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);
    const operation = document.paths['/api/v1/auth/login']?.post;

    expect(operation?.requestBody).toBeDefined();
    expect(operation?.responses).toHaveProperty('201');
    expect(operation?.responses).toHaveProperty('400');
    expect(operation?.responses).toHaveProperty('401');
    expect(document.components?.schemas).toHaveProperty(
      'AuthenticatedResponseDto',
    );
    expect(document.components?.schemas).toHaveProperty('LoginRequestDto');
    expect(document.components?.schemas).toHaveProperty(
      'MfaRequiredResponseDto',
    );
    expect(document.components?.schemas).toHaveProperty('ProblemDetailsDto');
    expect(operation?.responses?.['201']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: '#/components/schemas/AuthenticatedResponseDto' },
              { $ref: '#/components/schemas/MfaRequiredResponseDto' },
            ],
          },
        },
      },
    });
  });

  it('Bearer와 refresh cookie 보안 scheme을 구분한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(document.components?.securitySchemes).toHaveProperty('accessToken');
    expect(document.components?.securitySchemes).toHaveProperty(
      'refreshCookie',
    );
    expect(
      document.paths['/api/v1/auth/mfa/totp/setup']?.post?.security,
    ).toContainEqual({ accessToken: [] });
    expect(
      document.paths['/api/v1/auth/refresh']?.post?.security,
    ).toContainEqual({ refreshCookie: [] });
  });

  it('logout은 204 응답 body를 문서화하지 않는다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);
    const response =
      document.paths['/api/v1/auth/logout']?.post?.responses?.['204'];

    expect(response).toBeDefined();
    expect(response).not.toHaveProperty('content');
  });

  it('학습자 operation 열두 개의 요청·성공·보안·오류 계약을 모두 고정한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(LEARNER_OPERATIONS).toHaveLength(12);
    LEARNER_OPERATIONS.forEach((expected) => {
      const operation = document.paths[expected.path]?.[expected.method];
      expect(
        operation,
        `${expected.method.toUpperCase()} ${expected.path}`,
      ).toBeDefined();
      if (!operation) return;

      expect(operation.security).toContainEqual({ accessToken: [] });
      const parameters = (operation.parameters ?? []).flatMap((parameter) =>
        'name' in parameter ? [parameter] : [],
      );
      const pathParameters = parameters.filter(
        (parameter) => parameter.in === 'path',
      );
      const queryParameters = parameters.filter(
        (parameter) => parameter.in === 'query',
      );
      expect(pathParameters.map((parameter) => parameter.name).sort()).toEqual(
        [...(expected.pathParameters ?? [])].sort(),
      );
      pathParameters.forEach((parameter) => {
        expect(parameter.required).toBe(true);
        expect(parameter.schema).toMatchObject({
          type: 'string',
          format: 'uuid',
        });
      });
      expect(queryParameters.map((parameter) => parameter.name).sort()).toEqual(
        [...(expected.query ?? [])].sort(),
      );

      if (expected.body) {
        expect(operation.requestBody).toMatchObject({
          content: {
            'application/json': {
              schema: {
                $ref: `#/components/schemas/${expected.body}`,
              },
            },
          },
        });
      } else {
        expect(operation.requestBody).toBeUndefined();
      }

      const [successStatus, successDto] = expected.success;
      const success = operation.responses[successStatus];
      expect(success).toBeDefined();
      if (successDto) {
        expect(success).toMatchObject({
          content: {
            'application/json': {
              schema: {
                $ref: `#/components/schemas/${successDto}`,
              },
            },
          },
        });
      } else {
        expect(success).not.toHaveProperty('content');
      }

      expect(Object.keys(operation.responses).sort()).toEqual(
        [successStatus, ...expected.errors].sort(),
      );
      expected.errors.forEach((status) => {
        expect(operation.responses[status]).toMatchObject({
          content: {
            'application/problem+json': {
              schema: { $ref: '#/components/schemas/ProblemDetailsDto' },
            },
          },
        });
      });
    });
  });

  it('문제 상세 schema에는 정답·검증·private storage 필드가 없다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);
    const detail = JSON.stringify(
      document.components?.schemas?.QuestionDetailResponseDto,
    );

    expect(detail).not.toContain('correctOptionId');
    expect(detail).not.toContain('isCorrect');
    expect(detail).not.toContain('validationStatus');
    expect(detail).not.toContain('validationIssues');
    expect(detail).not.toContain('storageKey');
    expect(detail).not.toContain('EXPLANATION');
    expect(detail).toContain('audioUrl');
  });
});

describe('OpenAPI 노출 정책', () => {
  it('로컬·개발 환경은 고정된 UI와 JSON 경로를 사용한다', () => {
    expect(resolveOpenApiPaths('development')).toEqual({
      ui: 'api/docs',
      json: 'api/openapi.json',
    });
    expect(resolveOpenApiPaths('test')).toEqual({
      ui: 'api/docs',
      json: 'api/openapi.json',
    });
  });

  it('운영 환경은 Swagger route를 등록하지 않는다', () => {
    expect(resolveOpenApiPaths('production')).toBeNull();
    expect(() => configureOpenApi({} as never, 'production')).not.toThrow();
  });
});
