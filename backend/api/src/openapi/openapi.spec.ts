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
  '/api/v1/auth/challenges',
  '/api/v1/auth/challenges/{challengeId}/code',
  '/api/v1/auth/challenges/{challengeId}/link',
  '/api/v1/auth/challenges/{challengeId}/resend',
  '/api/v1/auth/mfa/totp/challenge',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/me',
  '/api/v1/me/recommendations',
  '/api/v1/me/vocabularies/{vocabularyId}/wordbook-memberships',
  '/api/v1/me/wordbooks',
  '/api/v1/me/wordbooks/{wordbookId}',
  '/api/v1/me/wordbooks/{wordbookId}/items',
  '/api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
  '/api/v1/me/wordbooks/{wordbookId}/items/copy',
  '/api/v1/me/wordbooks/{wordbookId}/items/move',
  '/api/v1/me/wordbooks/{wordbookId}/items/remove',
  '/api/v1/vocabularies',
  '/api/v1/vocabularies/{vocabularyId}',
  '/health',
  '/ready',
];

const INACTIVE_MVP_PATHS = [
  '/api/v1/auth/signup',
  '/api/v1/auth/signup/verify',
  '/api/v1/auth/password/forgot',
  '/api/v1/auth/password/reset',
  '/api/v1/auth/phone/challenges',
  '/api/v1/auth/phone/challenges/{challengeId}/verify',
  '/api/v1/auth/step-up/challenges',
  '/api/v1/auth/step-up/challenges/{challengeId}/verify',
  '/api/v1/auth/login',
  '/api/v1/me/saved-vocabularies',
  '/api/v1/me/saved-vocabularies/{vocabularyId}',
  '/api/v1/uploads/policies',
  '/api/v1/uploads/{uploadId}/complete',
  '/api/v1/jobs',
  '/api/v1/jobs/{jobId}',
] as const;

type OpenApiContentCarrier = {
  content?: Record<string, { schema?: unknown }>;
};

type OpenApiInlineParameter = {
  name: string;
  in: string;
  required?: boolean;
  schema?: unknown;
};

type LearnerOperationExpectation = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  pathParameters?: readonly string[];
  query?: readonly string[];
  body?: string;
  success: readonly [
    status: string,
    dto?: string | readonly [string, ...string[]],
  ];
  errors: readonly string[];
};

type ProtectedOperationExpectation = LearnerOperationExpectation & {
  headers?: readonly string[];
};

type IdentityOperationExpectation = {
  method: 'get' | 'post';
  path: string;
  pathParameters?: readonly string[];
  headers: readonly string[];
  body?: string;
  security: readonly Record<string, readonly never[]>[];
  success: readonly [status: string, dto?: string];
  errors: readonly string[];
};

type SystemOperationExpectation = {
  path: '/health' | '/ready';
  success: readonly [status: '200', dto: string];
  errors: readonly string[];
};

const IDENTITY_OPERATIONS: readonly IdentityOperationExpectation[] = [
  {
    method: 'post',
    path: '/api/v1/auth/challenges',
    headers: ['Origin', 'X-CSRF-Protection'],
    body: 'StartEmailAuthenticationRequestDto',
    security: [],
    success: ['201', 'EmailAuthenticationChallengeResponseDto'],
    errors: ['400', '403', '429', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/auth/challenges/{challengeId}/code',
    pathParameters: ['challengeId'],
    headers: ['Origin', 'X-CSRF-Protection'],
    body: 'VerifyEmailCodeRequestDto',
    security: [],
    success: ['201', 'authentication'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/auth/challenges/{challengeId}/link',
    pathParameters: ['challengeId'],
    headers: ['Origin', 'X-CSRF-Protection'],
    body: 'ConfirmEmailLinkRequestDto',
    security: [],
    success: ['201', 'authentication'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/auth/challenges/{challengeId}/resend',
    pathParameters: ['challengeId'],
    headers: ['Origin', 'X-CSRF-Protection'],
    security: [],
    success: ['201', 'EmailAuthenticationChallengeResponseDto'],
    errors: ['400', '401', '403', '404', '429', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/auth/mfa/totp/challenge',
    headers: ['Origin', 'X-CSRF-Protection'],
    body: 'TotpChallengeRequestDto',
    security: [],
    success: ['201', 'authentication'],
    errors: ['400', '401', '403', '429', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/auth/refresh',
    headers: ['Origin', 'X-CSRF-Protection'],
    security: [{ refreshCookie: [] }],
    success: ['201', 'authentication'],
    errors: ['401', '403', '429', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/auth/logout',
    headers: ['Origin', 'X-CSRF-Protection'],
    security: [{ refreshCookie: [] }],
    success: ['204'],
    errors: ['403', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/me',
    headers: [],
    security: [{ accessToken: [] }],
    success: ['200', 'MeResponseDto'],
    errors: ['401', '403', '500'],
  },
];

const SYSTEM_OPERATIONS: readonly SystemOperationExpectation[] = [
  {
    path: '/health',
    success: ['200', 'HealthResponseDto'],
    errors: [],
  },
  {
    path: '/ready',
    success: ['200', 'ReadinessResponseDto'],
    errors: ['503'],
  },
];

const OPEN_API_HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

const hasOpenApiContent = (value: unknown): value is OpenApiContentCarrier =>
  typeof value === 'object' && value !== null && 'content' in value;

const isOpenApiInlineParameter = (
  parameter: unknown,
): parameter is OpenApiInlineParameter =>
  typeof parameter === 'object' &&
  parameter !== null &&
  'name' in parameter &&
  typeof parameter.name === 'string' &&
  'in' in parameter &&
  typeof parameter.in === 'string';

const requireOpenApiInlineParameter = (
  parameter: unknown,
): OpenApiInlineParameter => {
  const isInline = isOpenApiInlineParameter(parameter);

  expect(isInline).toBe(true);
  if (!isInline) {
    throw new Error('OpenAPI parameter는 inline name을 가져야 합니다');
  }
  return parameter;
};

const collectOpenApiOperations = (
  paths: ReturnType<typeof createOpenApiDocument>['paths'],
  selectedPaths: ReadonlySet<string>,
): string[] =>
  Object.entries(paths)
    .filter(([path]) => selectedPaths.has(path))
    .flatMap(([path, pathItem]) =>
      OPEN_API_HTTP_METHODS.flatMap((method) =>
        pathItem[method] ? [`${method} ${path}`] : [],
      ),
    )
    .sort();

const expectProtectedOpenApiOperations = (
  document: ReturnType<typeof createOpenApiDocument>,
  expectations: readonly ProtectedOperationExpectation[],
): void => {
  expect(
    collectOpenApiOperations(
      document.paths,
      new Set(expectations.map(({ path }) => path)),
    ),
  ).toEqual(expectations.map(({ method, path }) => `${method} ${path}`).sort());

  expectations.forEach((expected) => {
    const operation = document.paths[expected.path]?.[expected.method];
    expect(
      operation,
      `${expected.method.toUpperCase()} ${expected.path}`,
    ).toBeDefined();
    if (!operation) return;

    expect(operation.security).toEqual([{ accessToken: [] }]);
    const parameters = (operation.parameters ?? []).map(
      requireOpenApiInlineParameter,
    );
    const pathParameters = parameters.filter(
      (parameter) => parameter.in === 'path',
    );
    const queryParameters = parameters.filter(
      (parameter) => parameter.in === 'query',
    );
    const headerParameters = parameters.filter(
      (parameter) => parameter.in === 'header',
    );
    expect(
      parameters,
      `${expected.method.toUpperCase()} ${expected.path} parameter count`,
    ).toHaveLength(
      (expected.pathParameters?.length ?? 0) +
        (expected.query?.length ?? 0) +
        (expected.headers?.length ?? 0),
    );
    expect(pathParameters.map(({ name }) => name).sort()).toEqual(
      [...(expected.pathParameters ?? [])].sort(),
    );
    pathParameters.forEach((parameter) => {
      expect(parameter.required).toBe(true);
      expect(parameter.schema).toEqual({
        type: 'string',
        format: 'uuid',
      });
    });
    expect(queryParameters.map(({ name }) => name).sort()).toEqual(
      [...(expected.query ?? [])].sort(),
    );
    expect(headerParameters.map(({ name }) => name).sort()).toEqual(
      [...(expected.headers ?? [])].sort(),
    );
    headerParameters.forEach((parameter) => {
      expect(parameter.required).toBe(true);

      if (
        parameter.name === 'Idempotency-Key' ||
        parameter.name === 'X-Request-ID'
      ) {
        expect(parameter.schema).toEqual({
          type: 'string',
          format: 'uuid',
        });
      }
    });

    if (expected.body) {
      const requestBody = operation.requestBody;
      const content = hasOpenApiContent(requestBody)
        ? requestBody.content
        : undefined;
      expect(Object.keys(content ?? {})).toEqual(['application/json']);
      expect(requestBody).toMatchObject({ required: true });
      expect(content?.['application/json']?.schema).toEqual({
        $ref: `#/components/schemas/${expected.body}`,
      });
    } else {
      expect(operation.requestBody).toBeUndefined();
    }

    const [successStatus, successDto] = expected.success;
    const success = operation.responses[successStatus];
    expect(success).toBeDefined();
    if (typeof successDto === 'string') {
      const content = hasOpenApiContent(success) ? success.content : undefined;
      expect(Object.keys(content ?? {})).toEqual(['application/json']);
      expect(content?.['application/json']?.schema).toEqual({
        $ref: `#/components/schemas/${successDto}`,
      });
    } else if (successDto) {
      const content = hasOpenApiContent(success) ? success.content : undefined;
      expect(Object.keys(content ?? {})).toEqual(['application/json']);
      expect(content?.['application/json']?.schema).toEqual({
        oneOf: successDto.map((dto) => ({
          $ref: `#/components/schemas/${dto}`,
        })),
      });
    } else {
      expect(success).not.toHaveProperty('content');
    }

    expect(Object.keys(operation.responses).sort()).toEqual(
      [successStatus, ...expected.errors].sort(),
    );
    expected.errors.forEach((status) => {
      const error = operation.responses[status];
      const content = hasOpenApiContent(error) ? error.content : undefined;
      expect(Object.keys(content ?? {})).toEqual(['application/problem+json']);
      expect(content?.['application/problem+json']?.schema).toEqual({
        $ref: '#/components/schemas/ProblemDetailsDto',
      });
    });
  });
};

const LEARNER_OPERATIONS: readonly LearnerOperationExpectation[] = [
  {
    method: 'get',
    path: '/api/v1/me/recommendations',
    success: ['200', 'RecommendationResponseDto'],
    errors: ['401', '403', '500'],
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
    path: '/api/v1/me/wordbooks',
    success: ['200', 'WordbookListResponseDto'],
    errors: ['401', '403', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/me/wordbooks',
    body: 'WordbookNameRequestDto',
    success: ['201', 'WordbookResponseDto'],
    errors: ['400', '401', '403', '409', '500'],
  },
  {
    method: 'patch',
    path: '/api/v1/me/wordbooks/{wordbookId}',
    pathParameters: ['wordbookId'],
    body: 'WordbookNameRequestDto',
    success: ['200', 'WordbookResponseDto'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'delete',
    path: '/api/v1/me/wordbooks/{wordbookId}',
    pathParameters: ['wordbookId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/me/wordbooks/{wordbookId}/items',
    pathParameters: ['wordbookId'],
    query: ['query', 'kind', 'partOfSpeech', 'difficulty', 'page', 'pageSize'],
    success: ['200', 'WordbookItemListResponseDto'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'put',
    path: '/api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
    pathParameters: ['wordbookId', 'vocabularyId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'delete',
    path: '/api/v1/me/wordbooks/{wordbookId}/items/{vocabularyId}',
    pathParameters: ['wordbookId', 'vocabularyId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/me/wordbooks/{wordbookId}/items/copy',
    pathParameters: ['wordbookId'],
    body: 'WordbookBulkItemsRequestDto',
    success: ['204'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/me/wordbooks/{wordbookId}/items/move',
    pathParameters: ['wordbookId'],
    body: 'WordbookBulkItemsRequestDto',
    success: ['204'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/me/wordbooks/{wordbookId}/items/remove',
    pathParameters: ['wordbookId'],
    body: 'WordbookRemoveItemsRequestDto',
    success: ['204'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/me/vocabularies/{vocabularyId}/wordbook-memberships',
    pathParameters: ['vocabularyId'],
    success: ['200', 'VocabularyWordbookMembershipResponseDto'],
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

  it('현재 활성 endpoint만 공개한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(Object.keys(document.paths).sort()).toEqual(ACTIVE_PATHS.sort());
  });

  it('보류한 legacy HTTP 경로를 MVP 문서에 노출하지 않는다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(INACTIVE_MVP_PATHS).toHaveLength(15);
    INACTIVE_MVP_PATHS.forEach((path) => {
      expect(document.paths).not.toHaveProperty(path);
    });
  });

  it('passwordless 요청·응답과 Problem Details schema를 공개한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);
    const operation = document.paths['/api/v1/auth/challenges']?.post;

    expect(operation?.requestBody).toBeDefined();
    expect(operation?.responses).toHaveProperty('201');
    expect(operation?.responses).toHaveProperty('400');
    expect(operation?.responses).toHaveProperty('403');
    expect(document.components?.schemas).toHaveProperty(
      'AuthenticatedResponseDto',
    );
    expect(document.components?.schemas).toHaveProperty(
      'StartEmailAuthenticationRequestDto',
    );
    expect(document.components?.schemas).toHaveProperty(
      'EmailAuthenticationChallengeResponseDto',
    );
    expect(document.components?.schemas).toHaveProperty(
      'MfaRequiredResponseDto',
    );
    expect(document.components?.schemas).toHaveProperty('ProblemDetailsDto');
    expect(operation?.responses?.['201']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/EmailAuthenticationChallengeResponseDto',
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
    expect(document.paths['/api/v1/me']?.get?.security).toContainEqual({
      accessToken: [],
    });
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

  it('Identity operation 열 개의 요청·성공·보안·오류 계약을 모두 고정한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(IDENTITY_OPERATIONS).toHaveLength(8);
    expect(document.security).toBeUndefined();
    expect(
      collectOpenApiOperations(
        document.paths,
        new Set(IDENTITY_OPERATIONS.map(({ path }) => path)),
      ),
    ).toEqual(
      IDENTITY_OPERATIONS.map(({ method, path }) => `${method} ${path}`).sort(),
    );
    IDENTITY_OPERATIONS.forEach((expected) => {
      const operation = document.paths[expected.path]?.[expected.method];
      expect(
        operation,
        `${expected.method.toUpperCase()} ${expected.path}`,
      ).toBeDefined();
      if (!operation) return;

      if (expected.security.length === 0) {
        expect(operation).not.toHaveProperty('security');
      } else {
        expect(operation.security).toEqual(expected.security);
      }
      const parameters = (operation.parameters ?? []).map(
        requireOpenApiInlineParameter,
      );
      const headerParameters = parameters.filter(
        (parameter) => parameter.in === 'header',
      );
      const pathParameters = parameters.filter(
        (parameter) => parameter.in === 'path',
      );
      expect(parameters).toHaveLength(
        expected.headers.length + (expected.pathParameters?.length ?? 0),
      );
      expect(headerParameters.map(({ name }) => name).sort()).toEqual(
        [...expected.headers].sort(),
      );
      expect(pathParameters.map(({ name }) => name).sort()).toEqual(
        [...(expected.pathParameters ?? [])].sort(),
      );
      pathParameters.forEach((parameter) => {
        expect(parameter.required).toBe(true);
        expect(parameter.schema).toEqual({
          type: 'string',
          format: 'uuid',
        });
      });
      headerParameters.forEach((parameter) => {
        expect(parameter.required).toBe(true);

        if (parameter.name === 'X-CSRF-Protection') {
          expect(parameter.schema).toEqual({
            type: 'string',
            enum: ['1'],
          });
        }
      });

      if (expected.body) {
        const requestBody = operation.requestBody;
        const content = hasOpenApiContent(requestBody)
          ? requestBody.content
          : undefined;
        expect(Object.keys(content ?? {})).toEqual(['application/json']);
        expect(requestBody).toMatchObject({ required: true });
        expect(content?.['application/json']?.schema).toEqual({
          $ref: `#/components/schemas/${expected.body}`,
        });
      } else {
        expect(operation.requestBody).toBeUndefined();
      }

      const [successStatus, successDto] = expected.success;
      const success = operation.responses[successStatus];
      expect(success).toBeDefined();
      if (successDto === 'authentication') {
        const content = hasOpenApiContent(success)
          ? success.content
          : undefined;
        expect(Object.keys(content ?? {})).toEqual(['application/json']);
        expect(content?.['application/json']?.schema).toEqual({
          oneOf: [
            {
              $ref: '#/components/schemas/AuthenticatedResponseDto',
            },
            {
              $ref: '#/components/schemas/MfaRequiredResponseDto',
            },
          ],
        });
      } else if (successDto) {
        const content = hasOpenApiContent(success)
          ? success.content
          : undefined;
        expect(Object.keys(content ?? {})).toEqual(['application/json']);
        expect(content?.['application/json']?.schema).toEqual({
          $ref: `#/components/schemas/${successDto}`,
        });
      } else {
        expect(success).not.toHaveProperty('content');
      }

      expect(Object.keys(operation.responses).sort()).toEqual(
        [successStatus, ...expected.errors].sort(),
      );
      expected.errors.forEach((status) => {
        const error = operation.responses[status];
        expect(
          Object.keys(hasOpenApiContent(error) ? (error.content ?? {}) : {}),
        ).toEqual(['application/problem+json']);
        expect(
          hasOpenApiContent(error)
            ? error.content?.['application/problem+json']?.schema
            : undefined,
        ).toEqual({ $ref: '#/components/schemas/ProblemDetailsDto' });
      });
    });
  });

  it('system operation 두 개의 공개 성공·오류 계약과 인증 부재를 고정한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(SYSTEM_OPERATIONS).toHaveLength(2);
    expect(document.security).toBeUndefined();
    expect(
      collectOpenApiOperations(
        document.paths,
        new Set(SYSTEM_OPERATIONS.map(({ path }) => path)),
      ),
    ).toEqual(SYSTEM_OPERATIONS.map(({ path }) => `get ${path}`).sort());
    SYSTEM_OPERATIONS.forEach((expected) => {
      const operation = document.paths[expected.path]?.get;
      expect(operation, `GET ${expected.path}`).toBeDefined();
      if (!operation) return;

      expect(operation.security).toBeUndefined();
      expect(operation.parameters ?? []).toEqual([]);
      expect(operation.requestBody).toBeUndefined();

      const [successStatus, successDto] = expected.success;
      const success = operation.responses[successStatus];
      const successContent = hasOpenApiContent(success)
        ? success.content
        : undefined;
      expect(Object.keys(successContent ?? {})).toEqual(['application/json']);
      expect(successContent?.['application/json']?.schema).toEqual({
        $ref: `#/components/schemas/${successDto}`,
      });
      expect(Object.keys(operation.responses).sort()).toEqual(
        [successStatus, ...expected.errors].sort(),
      );
      expected.errors.forEach((status) => {
        const error = operation.responses[status];
        expect(
          Object.keys(hasOpenApiContent(error) ? (error.content ?? {}) : {}),
        ).toEqual(['application/problem+json']);
        expect(
          hasOpenApiContent(error)
            ? error.content?.['application/problem+json']?.schema
            : undefined,
        ).toEqual({ $ref: '#/components/schemas/ProblemDetailsDto' });
      });
    });
  });

  it('학습자 operation 열다섯 개의 요청·성공·보안·오류 계약을 모두 고정한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(LEARNER_OPERATIONS).toHaveLength(14);
    expectProtectedOpenApiOperations(document, LEARNER_OPERATIONS);
  });

  it('관리자 및 오류 신고 경로를 노출하지 않는다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const paths = Object.keys(createOpenApiDocument(app).paths);
    expect(paths.filter((path) => path.startsWith('/api/v1/admin/'))).toEqual(
      [],
    );
    expect(paths).not.toContain('/api/v1/content-error-reports');
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
