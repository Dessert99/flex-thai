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
  '/api/v1/admin/content-imports',
  '/api/v1/admin/content-imports/{importId}',
  '/api/v1/admin/media-assets/audio-upload-requests',
  '/api/v1/admin/media-assets/{mediaAssetId}',
  '/api/v1/admin/media-assets/{mediaAssetId}/complete',
  '/api/v1/admin/questions',
  '/api/v1/admin/questions/{questionId}',
  '/api/v1/admin/questions/{questionId}/hide',
  '/api/v1/admin/questions/{questionId}/restore',
  '/api/v1/admin/questions/{questionId}/versions',
  '/api/v1/admin/question-versions/{versionId}',
  '/api/v1/admin/question-versions/{versionId}/invalidate',
  '/api/v1/admin/question-versions/{versionId}/publish',
  '/api/v1/admin/question-versions/{versionId}/validate',
  '/api/v1/admin/vocabularies',
  '/api/v1/admin/vocabularies/{vocabularyId}',
  '/api/v1/admin/vocabularies/{vocabularyId}/hide',
  '/api/v1/admin/vocabularies/{vocabularyId}/publish',
  '/api/v1/admin/vocabularies/{vocabularyId}/restore',
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

const INACTIVE_MVP_PATHS = [
  '/api/v1/auth/signup',
  '/api/v1/auth/signup/verify',
  '/api/v1/auth/password/forgot',
  '/api/v1/auth/password/reset',
  '/api/v1/auth/phone/challenges',
  '/api/v1/auth/phone/challenges/{challengeId}/verify',
  '/api/v1/auth/step-up/challenges',
  '/api/v1/auth/step-up/challenges/{challengeId}/verify',
  '/api/v1/uploads/policies',
  '/api/v1/uploads/{uploadId}/complete',
  '/api/v1/jobs',
  '/api/v1/jobs/{jobId}',
] as const;

type OpenApiSchemaNode = {
  type?: string;
  format?: string;
  properties?: Record<string, OpenApiSchemaNode>;
  items?: OpenApiSchemaNode;
  required?: string[];
  additionalProperties?: boolean;
};

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
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  pathParameters?: readonly string[];
  query?: readonly string[];
  body?: string;
  success: readonly [status: string, dto?: string];
  errors: readonly string[];
};

type AdminOperationExpectation = LearnerOperationExpectation & {
  headers?: readonly string[];
};

type IdentityOperationExpectation = {
  method: 'get' | 'post';
  path: string;
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
    path: '/api/v1/auth/login',
    headers: ['Origin', 'X-CSRF-Protection'],
    body: 'LoginRequestDto',
    security: [],
    success: ['201', 'authentication'],
    errors: ['400', '401', '403', '429', '500'],
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
    path: '/api/v1/auth/mfa/totp/setup',
    headers: [],
    security: [{ accessToken: [] }],
    success: ['201', 'TotpSetupResponseDto'],
    errors: ['401', '403', '429', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/auth/mfa/totp/setup/verify',
    headers: [],
    body: 'TotpSetupVerifyRequestDto',
    security: [{ accessToken: [] }],
    success: ['201', 'MeResponseDto'],
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
  expectations: readonly AdminOperationExpectation[],
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
    expect(parameters).toHaveLength(
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

      if (parameter.name === 'Idempotency-Key') {
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
    if (successDto) {
      const content = hasOpenApiContent(success) ? success.content : undefined;
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
      const content = hasOpenApiContent(error) ? error.content : undefined;
      expect(Object.keys(content ?? {})).toEqual(['application/problem+json']);
      expect(content?.['application/problem+json']?.schema).toEqual({
        $ref: '#/components/schemas/ProblemDetailsDto',
      });
    });
  });
};

const ADMIN_OPERATIONS: readonly AdminOperationExpectation[] = [
  {
    method: 'post',
    path: '/api/v1/admin/content-imports',
    headers: ['Idempotency-Key'],
    body: 'ContentImportRequestDto',
    success: ['201', 'ContentImportDetailResponseDto'],
    errors: ['400', '401', '403', '409', '413', '429', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/admin/content-imports',
    query: ['page', 'pageSize'],
    success: ['200', 'ContentImportListResponseDto'],
    errors: ['400', '401', '403', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/admin/content-imports/{importId}',
    pathParameters: ['importId'],
    success: ['200', 'ContentImportDetailResponseDto'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/media-assets/audio-upload-requests',
    body: 'AudioUploadRequestDto',
    success: ['201', 'AudioUploadResponseDto'],
    errors: ['400', '401', '403', '413', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/media-assets/{mediaAssetId}/complete',
    pathParameters: ['mediaAssetId'],
    success: ['200', 'CompleteMediaAssetResponseDto'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/admin/media-assets/{mediaAssetId}',
    pathParameters: ['mediaAssetId'],
    success: ['200', 'MediaAssetDetailResponseDto'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/admin/questions',
    query: [
      'status',
      'versionStatus',
      'validationStatus',
      'questionTypeSlug',
      'skill',
      'difficulty',
      'page',
      'pageSize',
    ],
    success: ['200', 'AdminQuestionListResponseDto'],
    errors: ['400', '401', '403', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/admin/questions/{questionId}',
    pathParameters: ['questionId'],
    success: ['200', 'AdminQuestionDetailResponseDto'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/questions/{questionId}/versions',
    pathParameters: ['questionId'],
    success: ['201', 'AdminQuestionVersionResponseDto'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'put',
    path: '/api/v1/admin/question-versions/{versionId}',
    pathParameters: ['versionId'],
    body: 'AdminQuestionVersionPayloadDto',
    success: ['200', 'AdminQuestionVersionResponseDto'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/question-versions/{versionId}/validate',
    pathParameters: ['versionId'],
    success: ['200', 'AdminQuestionValidationReportDto'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/question-versions/{versionId}/publish',
    pathParameters: ['versionId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/question-versions/{versionId}/invalidate',
    pathParameters: ['versionId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/questions/{questionId}/hide',
    pathParameters: ['questionId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/questions/{questionId}/restore',
    pathParameters: ['questionId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/admin/vocabularies',
    query: ['query', 'kind', 'status', 'page', 'pageSize'],
    success: ['200', 'AdminVocabularyListResponseDto'],
    errors: ['400', '401', '403', '500'],
  },
  {
    method: 'get',
    path: '/api/v1/admin/vocabularies/{vocabularyId}',
    pathParameters: ['vocabularyId'],
    success: ['200', 'AdminVocabularyDetailResponseDto'],
    errors: ['400', '401', '403', '404', '500'],
  },
  {
    method: 'put',
    path: '/api/v1/admin/vocabularies/{vocabularyId}',
    pathParameters: ['vocabularyId'],
    body: 'AdminVocabularyReplaceRequestDto',
    success: ['204'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/vocabularies/{vocabularyId}/publish',
    pathParameters: ['vocabularyId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/vocabularies/{vocabularyId}/hide',
    pathParameters: ['vocabularyId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
  {
    method: 'post',
    path: '/api/v1/admin/vocabularies/{vocabularyId}/restore',
    pathParameters: ['vocabularyId'],
    success: ['204'],
    errors: ['400', '401', '403', '404', '409', '500'],
  },
];

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

  it('현재 활성 endpoint의 서로 다른 path 서른여덟 개만 공개한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(Object.keys(document.paths).sort()).toEqual(ACTIVE_PATHS.sort());
  });

  it('보류한 legacy HTTP 경로를 MVP 문서에 노출하지 않는다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(INACTIVE_MVP_PATHS).toHaveLength(12);
    INACTIVE_MVP_PATHS.forEach((path) => {
      expect(document.paths).not.toHaveProperty(path);
    });
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

  it('Identity operation 일곱 개의 요청·성공·보안·오류 계약을 모두 고정한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(IDENTITY_OPERATIONS).toHaveLength(7);
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
      expect(parameters).toEqual(headerParameters);
      expect(headerParameters.map(({ name }) => name).sort()).toEqual(
        [...expected.headers].sort(),
      );
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

  it('학습자 operation 열두 개의 요청·성공·보안·오류 계약을 모두 고정한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(LEARNER_OPERATIONS).toHaveLength(12);
    expectProtectedOpenApiOperations(document, LEARNER_OPERATIONS);
  });

  it('관리자 operation 스물한 개의 입력·성공·Bearer·오류 계약을 모두 고정한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);

    expect(ADMIN_OPERATIONS).toHaveLength(21);
    expectProtectedOpenApiOperations(document, ADMIN_OPERATIONS);
  });

  it('관리자 DTO component JSON에는 private 내부 필드가 없다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);
    const adminComponents = Object.fromEntries(
      Object.entries(document.components?.schemas ?? {}).filter(([name]) =>
        /Admin|ContentImport|MediaAsset|AudioUpload/u.test(name),
      ),
    );
    const serialized = JSON.stringify(adminComponents);

    expect(serialized).not.toMatch(
      /storageKey|requestHash|referenceMap|isCorrect|dbRow/u,
    );
    expect(adminComponents).toHaveProperty('ContentImportRequestDto');
    expect(adminComponents).toHaveProperty('AdminQuestionDetailResponseDto');
    expect(adminComponents).toHaveProperty('AdminVocabularyDetailResponseDto');
  });

  it('관리자 문제 버전 교체 DTO는 콘텐츠 참조를 UUID 전용 object로 문서화한다', () => {
    if (!app)
      throw new Error('OpenAPI test application이 초기화되지 않았습니다');
    const document = createOpenApiDocument(app);
    const payload = document.components?.schemas
      ?.AdminQuestionVersionPayloadDto as
      | {
          properties?: Record<string, OpenApiSchemaNode>;
        }
      | undefined;
    const blockSentence =
      payload?.properties?.blocks?.items?.properties?.sentences?.items
        ?.properties?.sentence;
    const optionSentence =
      payload?.properties?.options?.items?.properties?.sentence;

    [blockSentence, optionSentence].forEach((sentence) => {
      const token = sentence?.properties?.tokens?.items;
      const expression = sentence?.properties?.expressions?.items;
      [
        token?.properties?.vocabulary,
        token?.properties?.meaning,
        token?.properties?.pronunciation,
        expression?.properties?.vocabulary,
      ].forEach((reference) => {
        expect(reference).toMatchObject({
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
          additionalProperties: false,
        });
        expect(Object.keys(reference?.properties ?? {})).toEqual(['id']);
      });
    });
    expect(
      payload?.properties?.options?.items?.properties?.clientRef,
    ).toMatchObject({ type: 'string' });
    expect(payload?.properties?.correctOptionRef).toMatchObject({
      type: 'string',
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
