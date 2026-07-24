# Swagger·OpenAPI Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 활성 HTTP API를 Zod 계약 기반 OpenAPI로 문서화하고 비운영 환경에서만 Swagger UI와 JSON을 제공한다.

**Architecture:** `shared/contracts`의 Zod schema를 `nestjs-zod` DTO로 연결하고 `@nestjs/swagger` decorator가 operation metadata를 소유한다. `backend/api/src/openapi`의 단일 설정 함수가 문서를 생성하며 `production`에서는 Swagger route를 등록하지 않는다.

**Tech Stack:** NestJS 11, `@nestjs/swagger` 11.4.6, `nestjs-zod` 5.4.0, Zod 4.4.3, Vitest

## Global Constraints

- Swagger UI는 비운영 환경의 `/api/docs`에서만 제공한다.
- OpenAPI JSON은 비운영 환경의 `/api/openapi.json`에서만 제공한다.
- `production`에서는 Swagger UI와 OpenAPI JSON route를 모두 등록하지 않는다.
- 공개 요청·응답 schema의 단일 원본은 `shared/contracts`의 Zod schema다.
- 현재 root application에 등록된 Identity·health endpoint 아홉 개만 문서화한다.
- root application에 등록되지 않은 legacy `jobs`, `uploads` endpoint는 문서화하지 않는다.
- Bearer token, refresh cookie, CSRF 조건과 RFC 9457 Problem Details 오류를 문서화한다.
- 새 공개 HTTP endpoint는 같은 변경에서 Swagger 문서와 OpenAPI document 단위 테스트를 추가해야 한다.
- 브라우저·API E2E 테스트는 추가하지 않는다.
- 새 코드와 변경 코드는 `conventions/comment-convention.md`를 따른다.
- 테스트의 `describe`, `it`, `test` 설명은 한국어로 작성한다.

---

### Task 1: Zod 계약 기반 OpenAPI 문서 생성

**Files:**

- Modify: `backend/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `shared/contracts/src/health/status.ts`
- Modify: `shared/contracts/src/index.ts`
- Create: `backend/api/src/openapi/openapi.dto.ts`
- Create: `backend/api/src/openapi/openapi.decorators.ts`
- Create: `backend/api/src/openapi/openapi.ts`
- Create: `backend/api/src/openapi/openapi.spec.ts`
- Modify: `backend/api/src/identity/identity.controller.ts`
- Modify: `backend/api/src/identity/cognito-authorizer.guard.ts`
- Modify: `backend/api/src/identity/csrf.guard.ts`
- Modify: `backend/api/src/identity/identity.module.ts`
- Modify: `backend/api/src/identity/me.controller.ts`
- Modify: `backend/api/src/health/health.controller.ts`
- Modify: `backend/api/src/health/readiness.service.ts`

**Interfaces:**

- Consumes:
  - `shared/contracts`의 Identity Zod schema와 `problemDetailsSchema`
  - Nest application의 Controller metadata
- Produces:
  - `createOpenApiDocument(app: INestApplication): OpenAPIObject`
  - Identity·health Zod DTO
  - 아홉 개 활성 endpoint의 OpenAPI operation

- [x] **Step 1: Swagger와 Zod DTO 의존성을 설치한다**

Run:

```bash
pnpm --filter @flex-thia/api add @nestjs/swagger@11.4.6 nestjs-zod@5.4.0
```

Expected: `backend/api/package.json`과 `pnpm-lock.yaml`에 두 runtime dependency가 추가된다.

- [x] **Step 2: OpenAPI document의 경로·계약·보안 metadata 실패 테스트를 작성한다**

`backend/api/src/openapi/openapi.spec.ts`는 실제 Nest application을 listen하지
않고 초기화해 document 객체만 검사한다.

```ts
/** 활성 API의 OpenAPI 경로·계약·보안 metadata를 검증한다 */
import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
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
  let app: INestApplication;

  beforeEach(async () => {
    app = await NestFactory.create(
      createApplicationModule({
        NODE_ENV: 'test',
        AUTH_MODE: 'fake',
        DATABASE_MODE: 'local',
        DATABASE_URL: 'postgres://local/test',
      }),
      { logger: false },
    );
    configureApp(app, ['http://localhost:5173'], 'production');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('현재 활성 endpoint 아홉 개만 공개한다', () => {
    const document = createOpenApiDocument(app);

    expect(Object.keys(document.paths).sort()).toEqual(ACTIVE_PATHS.sort());
    expect(document.paths).not.toHaveProperty('/api/v1/jobs');
    expect(document.paths).not.toHaveProperty('/api/v1/uploads/policies');
  });

  it('로그인 요청·응답과 Problem Details schema를 공개한다', () => {
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
  });

  it('Bearer와 refresh cookie 보안 scheme을 구분한다', () => {
    const document = createOpenApiDocument(app);

    expect(document.components?.securitySchemes).toHaveProperty('accessToken');
    expect(document.components?.securitySchemes).toHaveProperty('refreshCookie');
    expect(
      document.paths['/api/v1/auth/mfa/totp/setup']?.post?.security,
    ).toContainEqual({ accessToken: [] });
    expect(document.paths['/api/v1/auth/refresh']?.post?.security).toContainEqual(
      { refreshCookie: [] },
    );
  });

  it('logout은 204 응답 body를 문서화하지 않는다', () => {
    const document = createOpenApiDocument(app);
    const response =
      document.paths['/api/v1/auth/logout']?.post?.responses?.['204'];

    expect(response).toBeDefined();
    expect(response).not.toHaveProperty('content');
  });
});
```

- [x] **Step 3: OpenAPI 테스트가 생성 함수 미존재로 실패하는지 확인한다**

Run:

```bash
pnpm exec vitest run backend/api/src/openapi/openapi.spec.ts
```

Expected: FAIL with `./openapi.js` 또는 `createOpenApiDocument` 미존재 오류

- [x] **Step 4: health 공개 계약과 Zod DTO를 구현한다**

`shared/contracts/src/health/status.ts`:

```ts
/** health와 readiness의 공개 상태 응답 계약을 정의한다 */
import { z } from 'zod';

/** API 프로세스 생존 응답 */
export const healthResponseSchema = z
  .object({ status: z.literal('ok'), service: z.literal('api') })
  .strict();

/** DB 연결 준비 완료 응답 */
export const readinessResponseSchema = z
  .object({ status: z.literal('ready') })
  .strict();

/** 직렬화 가능한 API 생존 응답 type */
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** 직렬화 가능한 DB 준비 응답 type */
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
```

`shared/contracts/src/index.ts`에서 `./health/status.js`를 export한다.

`backend/api/src/openapi/openapi.dto.ts`는 `createZodDto`로 다음 class를
export한다.

```ts
/** 공개 Zod 계약을 Nest Swagger reflection DTO로 연결한다 */
import {
  authenticatedResponseSchema,
  healthResponseSchema,
  loginRequestSchema,
  meResponseSchema,
  mfaRequiredResponseSchema,
  problemDetailsSchema,
  readinessResponseSchema,
  totpChallengeRequestSchema,
  totpSetupResponseSchema,
  totpSetupVerifyRequestSchema,
} from '@flex-thia/contracts';
import { createZodDto } from 'nestjs-zod';

/** 로그인 요청 Swagger DTO */
export class LoginRequestDto extends createZodDto(loginRequestSchema) {}

/** access token과 공개 사용자를 포함한 인증 성공 Swagger DTO */
export class AuthenticatedResponseDto extends createZodDto(
  authenticatedResponseSchema,
) {}

/** TOTP challenge가 필요한 로그인 Swagger DTO */
export class MfaRequiredResponseDto extends createZodDto(
  mfaRequiredResponseSchema,
) {}

/** TOTP 로그인 challenge 요청 Swagger DTO */
export class TotpChallengeRequestDto extends createZodDto(
  totpChallengeRequestSchema,
) {}

/** TOTP 등록 확인 요청 Swagger DTO */
export class TotpSetupVerifyRequestDto extends createZodDto(
  totpSetupVerifyRequestSchema,
) {}

/** TOTP 등록 secret 응답 Swagger DTO */
export class TotpSetupResponseDto extends createZodDto(
  totpSetupResponseSchema,
) {}

/** 현재 사용자 응답 Swagger DTO */
export class MeResponseDto extends createZodDto(meResponseSchema) {}

/** API 생존 응답 Swagger DTO */
export class HealthResponseDto extends createZodDto(healthResponseSchema) {}

/** DB 준비 응답 Swagger DTO */
export class ReadinessResponseDto extends createZodDto(
  readinessResponseSchema,
) {}

/** RFC 9457 오류 응답 Swagger DTO */
export class ProblemDetailsDto extends createZodDto(problemDetailsSchema) {}
```

- [x] **Step 5: 공통 OpenAPI document factory를 구현한다**

`backend/api/src/openapi/openapi.ts`:

```ts
/** 활성 HTTP metadata에서 FLEX THIA OpenAPI document를 생성한다 */
import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { REFRESH_COOKIE_NAME } from '../identity/refresh-cookie.js';

const OPEN_API_CONFIG = new DocumentBuilder()
  .setTitle('FLEX THIA API')
  .setDescription('FLEX 태국어 학습 서비스 공개 API')
  .setVersion('1.0')
  .addBearerAuth(
    { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    'accessToken',
  )
  .addCookieAuth(REFRESH_COOKIE_NAME, undefined, 'refreshCookie')
  .build();

/** 현재 Nest Controller metadata에서 정리된 OpenAPI document를 만든다 */
export const createOpenApiDocument = (
  app: INestApplication,
): OpenAPIObject =>
  cleanupOpenApiDoc(SwaggerModule.createDocument(app, OPEN_API_CONFIG));
```

- [x] **Step 6: 모든 활성 Controller operation을 문서화한다**

각 Controller에 `@ApiTags`를 추가하고 각 method에는 다음 metadata를
명시한다.

| endpoint | success | 요청 DTO | 응답 DTO | security |
| --- | --- | --- | --- | --- |
| login | 201 | `LoginRequestDto` | 인증·MFA DTO `oneOf` | CSRF headers |
| TOTP challenge | 201 | `TotpChallengeRequestDto` | 인증·MFA DTO `oneOf` | CSRF headers |
| TOTP setup | 201 | 없음 | `TotpSetupResponseDto` | `accessToken` |
| TOTP setup verify | 201 | `TotpSetupVerifyRequestDto` | `MeResponseDto` | `accessToken` |
| refresh | 201 | 없음 | 인증·MFA DTO `oneOf` | `refreshCookie`, CSRF headers |
| logout | 204 | 없음 | 없음 | `refreshCookie`, CSRF headers |
| me | 200 | 없음 | `MeResponseDto` | `accessToken` |
| health | 200 | 없음 | `HealthResponseDto` | 없음 |
| ready | 200 | 없음 | `ReadinessResponseDto` | 없음 |

CSRF endpoint는 다음 두 header를 문서화한다.

```ts
@ApiHeader({
  name: 'Origin',
  required: true,
  description: '허용된 프론트엔드의 exact origin',
})
@ApiHeader({
  name: 'X-CSRF-Protection',
  required: true,
  schema: { type: 'string', enum: ['1'] },
})
```

공개 오류는 `@ApiResponse`와 `application/problem+json` content에서
`getSchemaPath(ProblemDetailsDto)`를 참조한다. Identity operation은 실제
Guard와 domain 오류에 맞춰 `400`, `401`, `403`, `409`, `429`, `500` 중
가능한 상태만 선언하고 readiness는 `503`을 선언한다.

class 기반 Guard가 interface와 배열 생성자 인자를 Nest enhancer에서
해석할 수 있도록 사용자 repository, authorizer 설정과 CSRF origin에
명시적 Symbol DI token을 사용한다.

- [x] **Step 7: OpenAPI document 테스트와 contracts 테스트를 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/api/src shared/contracts/src
pnpm --filter @flex-thia/api typecheck
pnpm --filter @flex-thia/contracts typecheck
```

Expected: 세 명령 모두 exit 0

- [x] **Step 8: Zod 기반 OpenAPI 계약을 커밋한다**

```bash
git add backend/api/package.json pnpm-lock.yaml shared/contracts/src backend/api/src/openapi backend/api/src/identity backend/api/src/health
git commit -m "feat: document active api contracts"
```

---

### Task 2: 비운영 Swagger route 연결

**Files:**

- Modify: `backend/api/src/openapi/openapi.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Modify: `backend/api/src/app.setup.ts`
- Modify: `backend/api/src/app.setup.spec.ts`

**Interfaces:**

- Consumes: Task 1의 `createOpenApiDocument`
- Produces:
  - `resolveOpenApiPaths(nodeEnv: string | undefined): OpenApiPaths | null`
  - `configureOpenApi(app: INestApplication, nodeEnv: string | undefined): void`
  - 비운영 `/api/docs`, `/api/openapi.json`

- [x] **Step 1: 환경별 Swagger route 정책 실패 테스트를 작성한다**

`backend/api/src/openapi/openapi.spec.ts`에 추가한다.

```ts
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
```

- [x] **Step 2: 새 export 미존재로 테스트가 실패하는지 확인한다**

Run:

```bash
pnpm exec vitest run backend/api/src/openapi/openapi.spec.ts
```

Expected: FAIL with `resolveOpenApiPaths` 또는 `configureOpenApi` 미존재 오류

- [x] **Step 3: 환경별 Swagger route 설정을 구현한다**

`backend/api/src/openapi/openapi.ts`에 추가한다.

```ts
/** 비운영 Swagger UI와 JSON의 고정 경로 */
export interface OpenApiPaths {
  ui: 'api/docs';
  json: 'api/openapi.json';
}

/** production에서 문서 route 자체를 만들지 않게 경로를 판정한다 */
export const resolveOpenApiPaths = (
  nodeEnv: string | undefined,
): OpenApiPaths | null =>
  nodeEnv === 'production'
    ? null
    : { ui: 'api/docs', json: 'api/openapi.json' };

/** 비운영 환경에만 Swagger UI와 OpenAPI JSON을 등록한다 */
export const configureOpenApi = (
  app: INestApplication,
  nodeEnv: string | undefined,
): void => {
  const paths = resolveOpenApiPaths(nodeEnv);

  if (!paths) {
    return;
  }

  SwaggerModule.setup(paths.ui, app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: paths.json,
  });
};
```

`configureApp`의 세 번째 인자로
`nodeEnv = process.env.NODE_ENV`를 추가하고 CORS 설정 뒤
`configureOpenApi(app, nodeEnv)`를 호출한다. 기존 mock 기반
`app.setup.spec.ts`는 `production`을 전달해 Swagger adapter 호출을
피하고, `configureOpenApi`의 환경 정책은 전용 테스트가 담당한다.

- [x] **Step 4: 노출 정책과 기존 app setup 테스트를 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/api/src/openapi/openapi.spec.ts backend/api/src/app.setup.spec.ts
pnpm --filter @flex-thia/api typecheck
```

Expected: 두 명령 모두 exit 0

- [x] **Step 5: 비운영 Swagger 연결을 커밋한다**

```bash
git add backend/api/src/openapi backend/api/src/app.setup.ts backend/api/src/app.setup.spec.ts
git commit -m "feat: expose swagger outside production"
```

---

### Task 3: Swagger 필수 규칙과 전체 검증

**Files:**

- Modify: `docs/superpowers/plans/2026-07-23-identity-auth-mvp.md`
- Modify: `docs/superpowers/plans/2026-07-23-backend-mvp-roadmap.md`
- Modify: `docs/development/backend-architecture.md`
- Modify: `docs/superpowers/plans/2026-07-23-swagger-openapi-documentation.md`

**Interfaces:**

- Consumes: Task 1·2의 Swagger 구현과 테스트
- Produces: 이후 공개 API 구현에 적용되는 Swagger 완료 조건

- [x] **Step 1: Identity 계획과 MVP 로드맵에 Swagger 필수 규칙을 추가한다**

Identity 계획의 `Global Constraints`와 `Completion Gate`, MVP 로드맵의
`공통 원칙`에 다음 규칙을 추가한다.

```text
root application에 등록하는 모든 공개 HTTP endpoint는 같은 변경에서
요청·응답·인증·오류 Swagger 문서와 OpenAPI document 단위 테스트를
추가해야 한다.
```

Identity 계획에는 별도 Task 8로 현재 아홉 endpoint의 Swagger 구현,
비운영 노출 정책, Zod 단일 원본과 검증 명령을 기록한다.

- [x] **Step 2: 백엔드 아키텍처에 전달 계층 문서화 규칙을 추가한다**

`backend/api` 책임과 코드 품질 규칙에 다음 내용을 추가한다.

```text
- root application에 등록하는 모든 공개 Controller operation은
  요청·응답·인증·오류 Swagger metadata를 같은 변경에서 제공한다.
- Swagger schema는 shared/contracts의 Zod schema를 단일 원본으로 사용한다.
- OpenAPI document 단위 테스트가 활성 path와 보안 scheme을 검증한다.
```

- [x] **Step 3: 문서와 코드 포맷을 검증한다**

Run:

```bash
pnpm exec prettier --check \
  backend/api/src/openapi \
  backend/api/src/identity \
  backend/api/src/health \
  shared/contracts/src \
  docs/development/backend-architecture.md \
  docs/superpowers/plans/2026-07-23-identity-auth-mvp.md \
  docs/superpowers/plans/2026-07-23-backend-mvp-roadmap.md \
  docs/superpowers/plans/2026-07-23-swagger-openapi-documentation.md
```

Expected: 모든 지정 파일이 Prettier 검사를 통과한다.

- [x] **Step 4: 전체 정적 검사·테스트·build를 실행한다**

Run:

```bash
pnpm structure:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- 구조 검사, lint, typecheck가 exit 0
- API·worker Lambda bundle 성공
- 모든 Vitest 단위 테스트 성공
- 모든 workspace build 성공

- [x] **Step 5: 변경 범위를 확인한다**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected:

- Swagger 구현, 공개 health 계약과 지정 문서만 변경된다.
- domain, database, providers, infra의 기능 코드는 변경되지 않는다.
- E2E 설정이나 테스트가 추가되지 않는다.
- whitespace 오류가 없다.

- [x] **Step 6: Swagger 필수 규칙과 최종 검증을 커밋한다**

```bash
git add docs/development/backend-architecture.md docs/superpowers/plans/2026-07-23-backend-mvp-roadmap.md docs/superpowers/plans/2026-07-23-identity-auth-mvp.md docs/superpowers/plans/2026-07-23-swagger-openapi-documentation.md
git commit -m "docs: require swagger for public api"
```
