# Backend MVP Stage 6 통합 정리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 1~5의 실제 root application을 하나의 MVP 실행 표면으로
고정하고, 보류된 legacy HTTP 경로의 비활성 상태와 모든 공개 API 계약·인증
보안 정책을 회귀 테스트로 완결한다.

**Architecture:** 제품 기능은 Stage 1~5 구현을 그대로 사용한다. Stage 6은
공통 request ID 코드의 역방향 의존을 제거하고, Nest root 조립과 OpenAPI
document를 실행 표면의 단일 관찰 지점으로 사용한다. Identity·system,
learner, admin operation의 요청·응답·인증·오류 metadata와 guard/cookie/
CORS/log 정책을 단위·document 테스트로 고정하며 새 도메인, schema,
migration, HTTP endpoint는 만들지 않는다.

**Tech Stack:** TypeScript, Vitest, NestJS, Zod, Swagger/OpenAPI

## Global Constraints

- 기준 HEAD는 Stage 5 전체 리뷰와 검증을 통과한 `95ce348`이다.
- 승인 설계와 현재 `IdentityModule`, `LearningModule`, `AdminModule`,
  `HealthController`, `ReadinessController` 공개 interface를 변경하지 않는다.
- 기존 signup·signup verify·forgot/reset, 전화번호·SMS, `/jobs`,
  `/uploads`는 파일과 미래 인프라를 삭제하지 않고 MVP root 실행 경로에서만
  계속 격리한다.
- PDF·OCR·AI·TTS 자동화, worker foundation task, queue, infra/CDK를
  활성화하거나 수정하지 않는다.
- root application에 등록된 모든 공개 operation은 요청·응답·인증·오류
  Swagger metadata와 OpenAPI document 테스트를 가져야 한다.
- ADMIN은 LEARNER 권한을 포함하고, 모든 보호 route는 access claim 뒤 DB의
  최신 `ACTIVE` 사용자·역할을 사용한다. 관리자 route는 TOTP 등록도
  요구한다.
- refresh token은 body·로그에 노출하지 않고 7일 `Secure`, `HttpOnly`,
  `SameSite=Strict`, `Path=/`, `__Host-` cookie에만 둔다.
- cookie 인증 write route는 exact Origin과
  `X-CSRF-Protection: 1`을 모두 요구한다. CORS는 exact allowlist와
  credentials만 허용한다.
- 예상하지 못한 오류 로그는 request ID, route, 내부 user ID만 포함하며
  token, cookie, 비밀번호, TOTP, 이메일, 원본 JSON은 포함하지 않는다.
- 브라우저·API E2E, 새 branch/worktree/PR을 만들지 않는다.
- 테스트 설명은 한국어로 작성하고 변경 export와 새 파일은
  `conventions/comment-convention.md`를 따른다.

---

### Task 1: 공통 request ID 경계 정리

**Files:**

- Move: `backend/api/src/admin/admin-request-id.ts` →
  `backend/api/src/common/http/admin-request-id.ts`
- Move: `backend/api/src/admin/admin-request-id.spec.ts` →
  `backend/api/src/common/http/admin-request-id.spec.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.ts`
- Modify: `backend/api/src/admin/admin-content-imports.controller.ts`
- Modify: `backend/api/src/admin/admin-media-assets.controller.ts`
- Modify: `backend/api/src/admin/admin-questions.controller.ts`
- Modify: `backend/api/src/admin/admin-vocabularies.controller.ts`
- Modify: `backend/api/src/admin/admin-media-assets.controller.spec.ts`

**Interfaces:**

- Consumes:
  `resolveAdminRequestId(request: AdminRequestIdRequest): string`과
  `AdminRequestId` decorator의 현재 동작.
- Produces: 같은 두 export를 `common/http/admin-request-id.ts`에서
  제공한다. 요청 객체의 저장값 → trim한 `x-request-id` → 생성 UUID
  우선순위와 controller/audit/filter의 단일 ID 공유는 바뀌지 않는다.

- [ ] **Step 1: 공통 경계 import RED를 작성한다**

테스트를 새 공통 경로로 먼저 옮기고 filter와 controller test가 공통
경로에서 두 export를 import하도록 바꾼다.

```ts
import {
  resolveAdminRequestId,
  type AdminRequestIdRequest,
} from './admin-request-id.js';

describe('공통 관리자 request id 문맥', () => {
  it('header가 없으면 한 번 생성해 command와 오류 응답이 공유한다', () => {
    const request: AdminRequestIdRequest = { headers: {} };
    const first = resolveAdminRequestId(request);

    expect(resolveAdminRequestId(request)).toBe(first);
  });
});
```

Run:

```bash
pnpm exec vitest run backend/api/src/common/http/admin-request-id.spec.ts backend/api/src/common/errors/domain-exception.filter.spec.ts
```

Expected: FAIL because the common module does not exist

- [ ] **Step 2: 구현을 공통 HTTP 경계로 이동한다**

기존 구현을 그대로 이동한다. `DomainExceptionFilter`는
`../http/admin-request-id.js`, 관리자 controller는
`../common/http/admin-request-id.js`를 import한다. `admin` 폴더 안의
원본 파일은 남기지 않는다.

- [ ] **Step 3: 역방향 의존 부재와 동작을 검증한다**

```bash
rg -n "admin/admin-request-id|\\./admin-request-id" backend/api/src/common backend/api/src/admin
pnpm exec vitest run backend/api/src/common/http/admin-request-id.spec.ts backend/api/src/common/errors/domain-exception.filter.spec.ts backend/api/src/admin
pnpm --filter @flex-thia/api typecheck
pnpm lint
git diff --check
```

Expected: tests PASS, `common`에서 `admin` feature import 0건

- [ ] **Step 4: 커밋한다**

```bash
git add backend/api/src/common backend/api/src/admin
git commit -m "refactor: move request id to common http"
```

---

### Task 2: MVP 실행 표면과 legacy 격리 고정

**Files:**

- Modify: `backend/api/src/app.module.spec.ts`
- Modify: `backend/api/src/identity/identity.controller.spec.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`

**Interfaces:**

- Consumes: root imports
  `IdentityModule.register(...)`, `LearningModule.register(...)`,
  `AdminModule.register(...)`, root controllers `HealthController`,
  `ReadinessController`, 현재 38개 active OpenAPI path.
- Produces: 보류 경로가 root Nest graph와 OpenAPI에 들어오면 실패하는
  명시적 회귀 테스트. Legacy 파일, contract, DB table, worker는 삭제하지
  않는다.

- [ ] **Step 1: inactive route manifest 테스트를 먼저 추가한다**

`openapi.spec.ts`에 다음 경로 집합을 추가하고 하나라도 document에 있으면
실패하게 한다.

```ts
const INACTIVE_MVP_PATHS = [
  '/api/v1/auth/signup',
  '/api/v1/auth/signup/verify',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/phone-verifications',
  '/api/v1/auth/mfa/sms/challenge',
  '/api/v1/jobs',
  '/api/v1/uploads/policies',
] as const;

it('보류한 legacy HTTP 경로를 MVP 문서에 노출하지 않는다', () => {
  const document = createOpenApiDocument(app!);

  INACTIVE_MVP_PATHS.forEach((path) => {
    expect(document.paths).not.toHaveProperty(path);
  });
});
```

Run:

```bash
pnpm exec vitest run backend/api/src/openapi/openapi.spec.ts
```

Expected: 새 manifest 테스트가 현재 active surface를 통과하는지 확인하고,
이후 임시로 `/api/v1/jobs`를 `ACTIVE_PATHS`에 넣으면 FAIL함을 확인한 뒤
임시 변경을 되돌린다

- [ ] **Step 2: root module graph를 exact하게 고정한다**

`app.module.spec.ts`에서 module 이름과 root controller 이름을 exact
비교하고 legacy module/controller 이름이 없는지 함께 검증한다.

```ts
expect(
  application.imports?.map(
    (entry) => (entry as { module: { name: string } }).module.name,
  ),
).toEqual(['IdentityModule', 'LearningModule', 'AdminModule']);
expect(
  application.controllers?.map(
    (controller) => (controller as { name: string }).name,
  ),
).toEqual(['HealthController', 'ReadinessController']);
```

`IdentityController.prototype`에는 signup, verifySignup, forgotPassword,
resetPassword, phone/SMS method가 없음을 한국어 테스트로 고정한다.

- [ ] **Step 3: 격리 테스트와 기존 미래 코드 보존을 검증한다**

```bash
pnpm exec vitest run backend/api/src/app.module.spec.ts backend/api/src/identity/identity.controller.spec.ts backend/api/src/openapi/openapi.spec.ts
test -f backend/api/src/jobs/jobs.module.ts
test -f backend/api/src/uploads/uploads.module.ts
test -f backend/worker/src/foundation-task.ts
pnpm --filter @flex-thia/api typecheck
pnpm lint
git diff --check
```

Expected: active root tests PASS, 보류 파일은 그대로 존재

- [ ] **Step 4: 커밋한다**

```bash
git add backend/api/src/app.module.spec.ts backend/api/src/identity/identity.controller.spec.ts backend/api/src/openapi/openapi.spec.ts
git commit -m "test: lock the mvp execution surface"
```

---

### Task 3: Identity·system OpenAPI exact 계약 완결

**Files:**

- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Modify only if a RED test exposes missing metadata:
  `backend/api/src/identity/identity.controller.ts`
- Modify only if a RED test exposes missing metadata:
  `backend/api/src/identity/me.controller.ts`
- Modify only if a RED test exposes missing metadata:
  `backend/api/src/health/health.controller.ts`
- Modify only if a RED test exposes missing metadata:
  `backend/api/src/health/readiness.service.ts`

**Interfaces:**

- Consumes: Identity 7 operations과 system 2 operations의 현재 controller
  signatures, Zod DTO, `accessToken`, `refreshCookie`,
  `ProblemDetailsDto`, `ApiCsrfProtection`.
- Produces: learner 12/admin 21 검증과 같은 수준의 exact request body,
  header, security, success response, 오류 status/media type 검증.

- [ ] **Step 1: Identity operation expectation table을 작성한다**

다음 7개 operation을 exact table로 선언한다.

```ts
const IDENTITY_OPERATIONS = [
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
] as const;
```

각 operation에서 header 이름·required 여부, body 유무, security exact
배열, success content, 전체 response key를 비교한다. `authentication`
success는 두 DTO의 `oneOf`를 exact 비교한다.

Run:

```bash
pnpm exec vitest run backend/api/src/openapi/openapi.spec.ts
```

Expected: FAIL if any request, response, auth, CSRF header, error status가
문서와 다름

- [ ] **Step 2: system operation과 공개 schema를 exact 검증한다**

`GET /health`는 인증 없이 `200 HealthResponseDto`만, `GET /ready`는 인증
없이 `200 ReadinessResponseDto`와 `503 ProblemDetailsDto`만 갖는지
검증한다. production Swagger route 비활성 테스트는 유지한다.

- [ ] **Step 3: 필요한 controller metadata만 최소 수정한다**

RED가 난 operation에만 기존 Zod DTO를 사용하는
`@ApiBody`, `@Api*Response`, `@ApiBearerAuth`/`@ApiCookieAuth`,
`@ApiCsrfProtection`, `@ApiProblemResponse`를 보완한다. 새 inline DTO나
새 endpoint를 만들지 않는다.

- [ ] **Step 4: OpenAPI와 API package를 검증하고 커밋한다**

```bash
pnpm exec vitest run backend/api/src/openapi/openapi.spec.ts backend/api/src/identity backend/api/src/health
pnpm --filter @flex-thia/api typecheck
pnpm lint
pnpm build
git diff --check
git add backend/api/src/openapi backend/api/src/identity backend/api/src/health
git commit -m "test: complete the mvp openapi contract"
```

---

### Task 4: 인증·cookie·CORS·로그 보안 회귀 매트릭스

**Files:**

- Modify: `backend/api/src/identity/identity.guards.spec.ts`
- Modify: `backend/api/src/identity/identity.controller.spec.ts`
- Modify: `backend/api/src/app.setup.spec.ts`
- Modify: `backend/api/src/common/logging/structured-logger.spec.ts`
- Modify only if a RED test exposes a defect:
  `backend/api/src/identity/cognito-authorizer.guard.ts`
- Modify only if a RED test exposes a defect:
  `backend/api/src/identity/application-role.guard.ts`
- Modify only if a RED test exposes a defect:
  `backend/api/src/identity/admin-mfa.guard.ts`
- Modify only if a RED test exposes a defect:
  `backend/api/src/identity/csrf.guard.ts`
- Modify only if a RED test exposes a defect:
  `backend/api/src/identity/refresh-cookie.ts`
- Modify only if a RED test exposes a defect:
  `backend/api/src/app.setup.ts`
- Modify only if a RED test exposes a defect:
  `backend/api/src/common/logging/structured-logger.ts`

**Interfaces:**

- Consumes: `CognitoAuthorizerGuard`, `ApplicationRoleGuard`,
  `AdminMfaGuard`, `CsrfGuard`, refresh cookie helpers, `configureApp`,
  `StructuredLogger`.
- Produces: 승인 보안 정책의 positive/negative case를 빠짐없이 고정하는
  단위 테스트. 실제 결함이 없으면 production 코드는 변경하지 않는다.

- [ ] **Step 1: access claim과 최신 DB 사용자 matrix를 작성한다**

`identity.guards.spec.ts`에 table-driven 테스트를 추가한다.

```ts
it.each([
  [{ token_use: 'id', client_id: 'client-id', sub: 'sub' }, 'token_use'],
  [{ token_use: 'access', client_id: 'other', sub: 'sub' }, 'client_id'],
  [{ token_use: 'access', client_id: 'client-id' }, 'sub'],
])('잘못된 Cognito %s claim은 요청 사용자를 만들지 않는다', async (claims) => {
  const request = { requestContext: { authorizer: { jwt: { claims } } } };

  await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({
    status: 401,
  });
  expect(request).not.toHaveProperty('user');
});
```

추가로 존재하지 않는 사용자, `DISABLED` 사용자, production fake header를
401로 거절하고, DB에서 읽은 최신 role/status만 request.user에 넣는지
검증한다.

- [ ] **Step 2: role·MFA·CSRF negative matrix를 작성한다**

- LEARNER는 ADMIN 요구를 403으로 거절
- ADMIN은 LEARNER 요구를 통과
- user가 없으면 role guard 403
- MFA 미등록 ADMIN은 403, 등록 ADMIN은 통과
- CSRF는 잘못된 Origin, prefix/suffix Origin, Origin 배열, header 누락,
  header 값이 `1`이 아닌 경우를 모두 403으로 거절

각 실패에서 다음 guard/use case가 호출되지 않는지도 spy로 고정한다.

- [ ] **Step 3: cookie·CORS·로그 비노출을 고정한다**

`identity.controller.spec.ts`에서 write와 clear 모두 cookie 이름/옵션이
다음 값과 exact 일치하고 body에 refresh token이 없는지 검증한다.

```ts
expect(cookieResponse.cookie).toHaveBeenCalledWith(
  '__Host-flex-thia-refresh',
  'refresh',
  {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
);
```

`app.setup.spec.ts`는 `enableCors`가 `{origin: exactAllowlist,
credentials: true}`를 받는지 검증한다. Logger 테스트는 대소문자가 다른
`Authorization`, `Cookie`, `password`, `totp`, `rawJson`, `storageKey`
metadata를 넣고 승인 로그에 허용되지 않은 값이 남지 않는지 고정한다.
현재 logger가 승인 금지 key를 제거하지 못하면 그 key만
`SENSITIVE_KEYS`에 추가한다.

- [ ] **Step 4: focused와 전체 검증을 실행한다**

```bash
pnpm exec vitest run backend/api/src/identity/identity.guards.spec.ts backend/api/src/identity/identity.controller.spec.ts backend/api/src/app.setup.spec.ts backend/api/src/common/logging/structured-logger.spec.ts backend/api/src/common/errors/domain-exception.filter.spec.ts
pnpm structure:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Expected: 전체 명령 PASS, 기존 PostgreSQL URL 의존 테스트만 명시적으로
skip

- [ ] **Step 5: 커밋한다**

```bash
git add backend/api/src/identity backend/api/src/app.setup.ts backend/api/src/app.setup.spec.ts backend/api/src/common/logging
git commit -m "test: harden mvp security regressions"
```

---

## Stage 6 완료 검증

모든 Task의 구현 리뷰와 수정 재검토가 끝난 뒤 별도 전체 리뷰 에이전트가
`95ce348..HEAD`를 승인 설계·roadmap·architecture와 교차 검토한다.

```bash
pnpm structure:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check 95ce348..HEAD
git status --short
```

완료 기준:

- root application은 Identity, Learning, Admin, health/readiness만 공개한다.
- signup·reset·phone/SMS·Jobs·Uploads는 코드 삭제 없이 실행 표면에서
  비활성이다.
- 38개 active path의 모든 Identity 7, learner 12, admin 21, system 2
  operation이 exact Swagger 요청·응답·인증·오류 검증을 가진다.
- access claim, 최신 DB 상태·역할 상속, 관리자 MFA, CSRF, refresh cookie,
  CORS, 오류 로그 비노출 회귀가 고정된다.
- 전체 test, lint, typecheck, build와 변경 파일 format 검증이 통과한다.
