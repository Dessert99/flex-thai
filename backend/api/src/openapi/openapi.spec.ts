/** 활성 API의 OpenAPI 경로·계약·보안 metadata를 검증한다 */
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApplicationModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { createOpenApiDocument } from './openapi.js';

const ACTIVE_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/mfa/totp/challenge',
  '/api/v1/auth/mfa/totp/setup',
  '/api/v1/auth/mfa/totp/setup/verify',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/me',
  '/health',
  '/ready',
];

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

  it('현재 활성 endpoint 아홉 개만 공개한다', () => {
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
});
