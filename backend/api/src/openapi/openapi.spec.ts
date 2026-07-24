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

const LEARNER_PATHS = ACTIVE_PATHS.filter(
  (path) =>
    path.startsWith('/api/v1/questions') ||
    path.startsWith('/api/v1/vocabularies') ||
    path.includes('/question-attempts') ||
    path.includes('/saved-questions') ||
    path.includes('/saved-vocabularies'),
);

describe('OpenAPI document', () => {
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

  it('학습자 operation 열두 개가 모두 Bearer 보안을 요구한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);
    const methods = ['get', 'post', 'put', 'delete'] as const;
    let operationCount = 0;

    LEARNER_PATHS.forEach((path) => {
      methods.forEach((method) => {
        const operation = document.paths[path]?.[method];
        if (!operation) return;
        operationCount += 1;
        expect(operation.security).toContainEqual({ accessToken: [] });
      });
    });

    expect(operationCount).toBe(12);
  });

  it('답안 body·201 응답과 문제 목록 query를 공개 DTO에서 문서화한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);
    const attempt =
      document.paths['/api/v1/questions/{questionId}/attempts']?.post;
    const list = document.paths['/api/v1/questions']?.get;

    expect(attempt?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/SubmitQuestionAttemptRequestDto',
          },
        },
      },
    });
    expect(attempt?.responses?.['201']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/SubmitQuestionAttemptResponseDto',
          },
        },
      },
    });
    expect(list?.parameters?.map((parameter) => parameter)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'pageSize', in: 'query' }),
        expect.objectContaining({ name: 'firstResult', in: 'query' }),
      ]),
    );
  });

  it('학습자 오류는 problem media type이고 저장 204에는 body가 없다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);
    const problem =
      document.paths['/api/v1/questions/{questionId}/attempts']?.post
        ?.responses?.['409'];
    const savedOperations = [
      document.paths['/api/v1/me/saved-questions/{questionId}']?.put,
      document.paths['/api/v1/me/saved-questions/{questionId}']?.delete,
      document.paths['/api/v1/me/saved-vocabularies/{vocabularyId}']?.put,
      document.paths['/api/v1/me/saved-vocabularies/{vocabularyId}']?.delete,
    ];

    expect(problem).toMatchObject({
      content: {
        'application/problem+json': {
          schema: { $ref: '#/components/schemas/ProblemDetailsDto' },
        },
      },
    });
    savedOperations.forEach((operation) => {
      expect(operation?.responses?.['204']).toBeDefined();
      expect(operation?.responses?.['204']).not.toHaveProperty('content');
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
