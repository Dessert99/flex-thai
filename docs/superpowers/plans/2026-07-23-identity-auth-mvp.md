# Identity and Authentication MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사전 준비된 Cognito 계정으로 로그인하고, 관리자 TOTP MFA,
15분 access token, 7일 회전 refresh cookie, DB 기반 역할 상속을 사용하는
MVP identity 경계를 만든다.

**Architecture:** `shared/contracts`가 공개 JSON을 정의하고,
`backend/domain/src/identity`가 인증 흐름과 port를 소유한다. Cognito와
fake 구현은 `backend/providers/src/identity`, 사용자 저장은
`backend/database`, NestJS HTTP 전달과 guard는 `backend/api/src/identity`에
둔다. 공개 가입·셀프 비밀번호 재설정·전화번호·SMS step-up·Job·입력
업로드는 API 조립에서 제외하지만 기존 DB 테이블과 인프라는 이 계획에서
삭제하지 않는다.

**Tech Stack:** Node.js 22, TypeScript, NestJS 11, Zod 4, Vitest 4,
Amazon Cognito AWS SDK v3, PostgreSQL, Drizzle ORM 0.45, pnpm 10

## Global Constraints

- 기준 설계:
  `docs/superpowers/specs/2026-07-23-backend-mvp-domain-erd-api-design.md`
- 백엔드 구조: `docs/development/backend-architecture.md`
- access token은 15분이며 프론트 메모리에만 둔다.
- refresh token은 7일이며 `__Host-flex-thia-refresh`,
  `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`을 사용한다.
- 로그인·TOTP challenge·refresh·logout은 exact Origin과
  `X-CSRF-Protection: 1`을 요구한다.
- `ADMIN`은 `LEARNER` 권한을 포함하며 관리자 API는 TOTP 등록을 요구한다.
- 공개 signup, 셀프 password reset, SMS step-up API를 노출하지 않는다.
- root application에 등록하는 모든 공개 HTTP endpoint는 같은 변경에서
  요청·응답·인증·오류 Swagger 문서와 OpenAPI document 단위 테스트를
  추가한다.
- 인프라 코드, 배포, Lambda DI metadata 문제는 수정하지 않는다.
- 브라우저·API E2E 테스트를 추가하지 않는다.
- 테스트의 `describe`, `it`, `test` 설명은 한국어로 작성한다.
- 새 파일과 변경 export는 `conventions/comment-convention.md`를 따른다.
- 새 추상화와 라이브러리는 이 계획에 명시한 것만 추가한다.

---

## File Map

### 생성

- `shared/contracts/src/common/problem.ts`
- `shared/contracts/src/common/problem.spec.ts`
- `shared/contracts/src/identity/auth.ts`
- `shared/contracts/src/identity/auth.spec.ts`
- `backend/domain/src/identity/authentication.ts`
- `backend/domain/src/identity/authentication.service.ts`
- `backend/domain/src/identity/authentication.service.spec.ts`
- `backend/domain/src/identity/user.repository.ts`
- `backend/providers/src/identity/cognito-authentication.provider.ts`
- `backend/providers/src/identity/cognito-authentication.provider.spec.ts`
- `backend/providers/src/identity/fake-authentication.provider.ts`
- `backend/providers/src/identity/fake-authentication.provider.spec.ts`
- `backend/api/src/identity/identity.controller.ts`
- `backend/api/src/identity/identity.controller.spec.ts`
- `backend/api/src/identity/me.controller.ts`
- `backend/api/src/identity/identity.module.ts`
- `backend/api/src/identity/refresh-cookie.ts`
- `backend/api/src/identity/cognito-authorizer.guard.ts`
- `backend/api/src/identity/application-role.guard.ts`
- `backend/api/src/identity/admin-mfa.guard.ts`
- `backend/api/src/identity/csrf.guard.ts`
- `backend/api/src/identity/require-role.decorator.ts`
- `backend/api/src/identity/identity.guards.spec.ts`
- `backend/api/src/openapi/openapi.decorators.ts`
- `backend/api/src/openapi/openapi.dto.ts`
- `backend/api/src/openapi/openapi.spec.ts`
- `backend/api/src/openapi/openapi.ts`
- `backend/api/src/app.setup.spec.ts`
- `shared/contracts/src/health/status.ts`
- `backend/database/drizzle/0002_identity-mfa.sql`
- `backend/database/drizzle/meta/0002_snapshot.json`

### 수정

- `shared/contracts/src/index.ts`
- `backend/domain/src/index.ts`
- `backend/domain/src/auth/user.repository.ts`
- `backend/providers/src/index.ts`
- `backend/providers/src/fakes/index.ts`
- `backend/database/src/schema/identity.schema.ts`
- `backend/database/src/schema/schema.spec.ts`
- `backend/database/src/repositories/drizzle-user.repository.ts`
- `backend/database/src/repositories/drizzle-auth.repository.spec.ts`
- `backend/database/drizzle/meta/_journal.json`
- `backend/api/src/common/auth/current-user.decorator.ts`
- `backend/api/src/common/errors/domain-exception.filter.ts`
- `backend/api/src/common/errors/domain-exception.filter.spec.ts`
- `backend/api/src/app.module.ts`
- `backend/api/src/app.module.spec.ts`
- `backend/api/src/app.setup.ts`
- `backend/api/src/runtime-config.ts`
- `backend/api/src/runtime-config.spec.ts`
- `backend/api/src/health/health.controller.ts`
- `backend/api/src/health/readiness.service.ts`
- `backend/api/src/jobs/jobs.controller.ts`
- `backend/api/src/uploads/uploads.controller.ts`
- `backend/config/src/api-env.ts`
- `backend/config/src/api-env.spec.ts`
- `.env.example`
- `backend/api/package.json`
- `pnpm-lock.yaml`
- `docs/development/backend-foundation.md`
- `docs/development/project-structure.md`

### 삭제

- `backend/api/src/auth/auth.controller.ts`
- `backend/api/src/auth/auth.controller.spec.ts`
- `backend/api/src/auth/auth.module.ts`
- `backend/api/src/auth/auth.guards.spec.ts`
- `backend/api/src/auth/application-role.guard.ts`
- `backend/api/src/auth/cognito-authorizer.guard.ts`
- `backend/api/src/auth/csrf.guard.ts`
- `backend/api/src/auth/require-role.decorator.ts`
- `backend/api/src/auth/phone-verification.controller.ts`
- `backend/api/src/auth/step-up.controller.ts`
- `backend/api/src/auth/step-up.controller.spec.ts`

`authChallenges`, `stepUpChallenges`, `stepUpGrants` DB schema와 기존
domain/provider 구현은 이 단계에서 제거하지 않는다. 실행 가능한 HTTP
경로에서만 격리한다.

---

### Task 1: 공개 인증·오류 계약

**Files:**

- Create: `shared/contracts/src/common/problem.ts`
- Create: `shared/contracts/src/common/problem.spec.ts`
- Create: `shared/contracts/src/identity/auth.ts`
- Create: `shared/contracts/src/identity/auth.spec.ts`
- Modify: `shared/contracts/src/index.ts`

**Interfaces:**

- Produces:
  - `problemDetailsSchema`
  - `loginRequestSchema`
  - `totpChallengeRequestSchema`
  - `totpSetupVerifyRequestSchema`
  - `totpSetupResponseSchema`
  - `authenticatedResponseSchema`
  - `loginResponseSchema`
  - `meResponseSchema`
  - 각 schema에서 추론한 동일 이름의 `Input` 또는 `Response` 타입

- [ ] **Step 1: 잘못된 body와 정답 응답 형태를 고정하는 실패 테스트를 작성한다**

```ts
/** MVP 로그인과 TOTP 공개 계약을 검증한다 */
import { describe, expect, it } from 'vitest';
import {
  loginRequestSchema,
  loginResponseSchema,
  totpChallengeRequestSchema,
} from './auth.js';

describe('identity 인증 계약', () => {
  it('로그인 이메일을 정규화하고 빈 비밀번호를 거부한다', () => {
    expect(
      loginRequestSchema.parse({
        email: ' ADMIN@EXAMPLE.COM ',
        password: 'Strong1!',
      }),
    ).toEqual({ email: 'admin@example.com', password: 'Strong1!' });

    expect(() =>
      loginRequestSchema.parse({
        email: 'admin@example.com',
        password: '',
      }),
    ).toThrow();
  });

  it('TOTP 로그인 challenge는 이메일·session·6자리 code를 요구한다', () => {
    expect(() =>
      totpChallengeRequestSchema.parse({
        email: 'admin@example.com',
        challengeToken: 'session',
        code: '12345',
      }),
    ).toThrow();
  });

  it('로그인 응답은 인증 성공과 MFA 요구만 허용한다', () => {
    expect(
      loginResponseSchema.parse({
        status: 'MFA_REQUIRED',
        challengeToken: 'session',
      }),
    ).toEqual({ status: 'MFA_REQUIRED', challengeToken: 'session' });
  });
});
```

- [ ] **Step 2: contracts 테스트가 새 모듈을 찾지 못해 실패하는지 확인한다**

Run:

```bash
pnpm --filter @flex-thia/contracts test
```

Expected: FAIL with `Cannot find module './auth.js'` 또는 export 미정의 오류

- [ ] **Step 3: Zod 계약을 최소 구현한다**

```ts
/** 로그인·TOTP·현재 사용자 공개 JSON 계약을 정의한다 */
import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(1).max(256);
const totpCodeSchema = z.string().regex(/^\d{6}$/u);

/** 이메일과 비밀번호 로그인 요청 */
export const loginRequestSchema = z
  .object({ email: emailSchema, password: passwordSchema })
  .strict();

/** Cognito SOFTWARE_TOKEN_MFA challenge 완료 요청 */
export const totpChallengeRequestSchema = z
  .object({
    email: emailSchema,
    challengeToken: z.string().min(1).max(4096),
    code: totpCodeSchema,
  })
  .strict();

/** TOTP 등록 검증 요청 */
export const totpSetupVerifyRequestSchema = z
  .object({ code: totpCodeSchema })
  .strict();

/** 인증 앱에 등록할 Cognito TOTP secret 응답 */
export const totpSetupResponseSchema = z
  .object({ secretCode: z.string().min(16).max(128) })
  .strict();

const userSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  role: z.enum(['LEARNER', 'ADMIN']),
  mfaEnrolled: z.boolean(),
});

/** access token과 공개 사용자 정보를 반환하는 인증 성공 응답 */
export const authenticatedResponseSchema = z.object({
  status: z.literal('AUTHENTICATED'),
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: userSchema,
});

/** 비밀번호 인증이 TOTP 입력을 요구하는 응답 */
export const mfaRequiredResponseSchema = z.object({
  status: z.literal('MFA_REQUIRED'),
  challengeToken: z.string().min(1),
});

/** 로그인·TOTP 완료·refresh가 공유하는 인증 응답 */
export const loginResponseSchema = z.discriminatedUnion('status', [
  authenticatedResponseSchema,
  mfaRequiredResponseSchema,
]);

/** 현재 인증 사용자 응답 */
export const meResponseSchema = userSchema;

export type LoginInput = z.infer<typeof loginRequestSchema>;
export type TotpChallengeInput = z.infer<typeof totpChallengeRequestSchema>;
export type TotpSetupVerifyInput = z.infer<
  typeof totpSetupVerifyRequestSchema
>;
export type TotpSetupResponse = z.infer<typeof totpSetupResponseSchema>;
export type AuthenticatedResponse = z.infer<
  typeof authenticatedResponseSchema
>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
```

`problem.ts`는 `type`, `title`, `status`, `code`, `requestId`,
`fieldErrors: Array<{ path: string; message: string }>`를 가진 strict schema로
작성한다. `shared/contracts/src/index.ts`는 `./common/problem.js`와
`./identity/auth.js`를 공개한다.

- [ ] **Step 4: contracts 테스트와 typecheck를 통과시킨다**

Run:

```bash
pnpm --filter @flex-thia/contracts test
pnpm --filter @flex-thia/contracts typecheck
```

Expected: 두 명령 모두 exit 0

- [ ] **Step 5: 계약 변경을 커밋한다**

```bash
git add shared/contracts/src
git commit -m "feat: define identity api contracts"
```

---

### Task 2: Identity domain port와 인증 use case

**Files:**

- Create: `backend/domain/src/identity/authentication.ts`
- Create: `backend/domain/src/identity/authentication.service.ts`
- Create: `backend/domain/src/identity/authentication.service.spec.ts`
- Create: `backend/domain/src/identity/user.repository.ts`
- Modify: `backend/domain/src/index.ts`

**Interfaces:**

- Consumes:
  - provider가 구현할 `AuthenticationProvider`
  - database가 구현할 `IdentityUserRepository`
- Produces:
  - `IdentityAuthenticationService.login(email, password)`
  - `IdentityAuthenticationService.completeTotpChallenge(input)`
  - `IdentityAuthenticationService.startTotpSetup(accessToken)`
  - `IdentityAuthenticationService.verifyTotpSetup(input)`
  - `IdentityAuthenticationService.refresh(refreshToken)`
  - `IdentityAuthenticationService.logout(refreshToken)`
  - `IdentityDomainError`

- [ ] **Step 1: 로그인·MFA·refresh의 domain 실패 테스트를 작성한다**

```ts
/** 사전 준비 계정 로그인과 TOTP 상태 전이를 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import { IdentityAuthenticationService } from './authentication.service.js';

const tokens = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 900,
  subject: 'cognito-sub',
  email: 'admin@example.com',
};

describe('IdentityAuthenticationService', () => {
  it('Cognito 인증 성공 뒤에만 DB identity를 연결한다', async () => {
    const provider = {
      login: vi.fn().mockResolvedValue({ kind: 'AUTHENTICATED', tokens }),
    };
    const users = {
      upsertIdentity: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        cognitoSub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        mfaEnrolledAt: new Date(),
      }),
    };
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
    );

    await expect(
      service.login(' ADMIN@EXAMPLE.COM ', 'Strong1!'),
    ).resolves.toMatchObject({
      kind: 'AUTHENTICATED',
      user: { role: 'ADMIN' },
    });
    expect(provider.login).toHaveBeenCalledWith(
      'admin@example.com',
      'Strong1!',
    );
    expect(users.upsertIdentity).toHaveBeenCalledWith({
      subject: 'cognito-sub',
      email: 'admin@example.com',
    });
  });

  it('MFA challenge에는 사용자를 upsert하지 않는다', async () => {
    const provider = {
      login: vi.fn().mockResolvedValue({
        kind: 'MFA_REQUIRED',
        challengeToken: 'session',
      }),
    };
    const users = { upsertIdentity: vi.fn() };
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
    );

    await expect(
      service.login('admin@example.com', 'Strong1!'),
    ).resolves.toEqual({
      kind: 'MFA_REQUIRED',
      challengeToken: 'session',
    });
    expect(users.upsertIdentity).not.toHaveBeenCalled();
  });

  it('TOTP 등록 성공 뒤에만 mfaEnrolledAt을 기록한다', async () => {
    const provider = { verifyTotpSetup: vi.fn().mockResolvedValue(undefined) };
    const users = { markMfaEnrolled: vi.fn().mockResolvedValue({}) };
    const now = new Date('2026-07-23T00:00:00.000Z');
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
      () => now,
    );

    await service.verifyTotpSetup({
      subject: 'cognito-sub',
      accessToken: 'access',
      code: '123456',
    });

    expect(users.markMfaEnrolled).toHaveBeenCalledWith('cognito-sub', now);
  });

  it('비활성 계정에 발급된 refresh token을 즉시 폐기한다', async () => {
    const provider = {
      login: vi.fn().mockResolvedValue({ kind: 'AUTHENTICATED', tokens }),
      revoke: vi.fn().mockResolvedValue(undefined),
    };
    const users = {
      upsertIdentity: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        cognitoSub: 'cognito-sub',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'DISABLED',
        mfaEnrolledAt: new Date(),
      }),
    };
    const service = new IdentityAuthenticationService(
      provider as never,
      users as never,
    );

    await expect(
      service.login('admin@example.com', 'Strong1!'),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    expect(provider.revoke).toHaveBeenCalledWith('refresh');
  });
});
```

- [ ] **Step 2: domain 테스트가 새 use case를 찾지 못해 실패하는지 확인한다**

Run:

```bash
pnpm --filter @flex-thia/domain test
```

Expected: FAIL with `Cannot find module './authentication.service.js'`

- [ ] **Step 3: provider와 repository port를 정의한다**

```ts
/** Cognito와 local fake가 구현할 인증 결과와 동작을 정의한다 */
export interface IdentityTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  subject: string;
  email: string;
}

export type ProviderLoginResult =
  | { kind: 'AUTHENTICATED'; tokens: IdentityTokenSet }
  | { kind: 'MFA_REQUIRED'; challengeToken: string };

export interface AuthenticationProvider {
  login(email: string, password: string): Promise<ProviderLoginResult>;
  completeTotpChallenge(input: {
    email: string;
    challengeToken: string;
    code: string;
  }): Promise<IdentityTokenSet>;
  startTotpSetup(accessToken: string): Promise<{ secretCode: string }>;
  verifyTotpSetup(accessToken: string, code: string): Promise<void>;
  refresh(refreshToken: string): Promise<IdentityTokenSet>;
  revoke(refreshToken: string): Promise<void>;
}

export class AuthenticationProviderError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CREDENTIALS'
      | 'INVALID_MFA_CHALLENGE'
      | 'INVALID_TOTP'
      | 'INVALID_REFRESH_TOKEN'
      | 'AUTH_RATE_LIMITED'
      | 'AUTH_CONFIGURATION_ERROR',
  ) {
    super(code);
    this.name = 'AuthenticationProviderError';
  }
}
```

```ts
/** identity use case가 사용하는 애플리케이션 사용자 저장 port */
export interface IdentityUser {
  id: string;
  cognitoSub: string;
  email: string;
  role: 'LEARNER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  mfaEnrolledAt: Date | null;
}

export interface IdentityUserRepository {
  findBySub(subject: string): Promise<IdentityUser | null>;
  upsertIdentity(input: {
    subject: string;
    email: string;
  }): Promise<IdentityUser>;
  markMfaEnrolled(subject: string, enrolledAt: Date): Promise<IdentityUser>;
}
```

- [ ] **Step 4: 인증 use case를 최소 구현한다**

`IdentityAuthenticationService`는 이메일을 `trim().toLowerCase()`로
정규화한다. provider의 `INVALID_CREDENTIALS`, `INVALID_MFA_CHALLENGE`,
`INVALID_TOTP`, `INVALID_REFRESH_TOKEN`, `AUTH_RATE_LIMITED`를 같은 이름의
`IdentityDomainError`로 바꾸고 `AUTH_CONFIGURATION_ERROR`는 내부 오류로
유지한다.

인증 성공과 refresh 성공은 공통 private method에서
`users.upsertIdentity({ subject, email })`를 호출한 뒤 다음 타입을
반환한다.

```ts
export type AuthenticationResult =
  | {
      kind: 'AUTHENTICATED';
      tokens: IdentityTokenSet;
      user: IdentityUser;
    }
  | { kind: 'MFA_REQUIRED'; challengeToken: string };
```

조회된 사용자가 `DISABLED`면 새 refresh token을 즉시 revoke하고
`ACCOUNT_DISABLED`를 반환한다. 발급된 access token은 보호 API의
authorizer guard에서도 계속 거부한다.

`verifyTotpSetup`은 provider 확인 성공 뒤에만 `markMfaEnrolled`를 호출한다.
`logout`은 provider의 `revoke`를 그대로 위임한다.

- [ ] **Step 5: domain 테스트와 typecheck를 통과시킨다**

Run:

```bash
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/domain typecheck
```

Expected: 두 명령 모두 exit 0

- [ ] **Step 6: identity domain을 커밋한다**

```bash
git add backend/domain/src
git commit -m "feat: add identity authentication domain"
```

---

### Task 3: Cognito와 local fake 인증 adapter

**Files:**

- Create: `backend/providers/src/identity/cognito-authentication.provider.ts`
- Create: `backend/providers/src/identity/cognito-authentication.provider.spec.ts`
- Create: `backend/providers/src/identity/fake-authentication.provider.ts`
- Create: `backend/providers/src/identity/fake-authentication.provider.spec.ts`
- Modify: `backend/providers/src/index.ts`
- Modify: `backend/providers/src/fakes/index.ts`

**Interfaces:**

- Implements: Task 2의 `AuthenticationProvider`
- Produces:
  - `CognitoAuthenticationProvider`
  - `FakeAuthenticationProvider`

- [ ] **Step 1: Cognito 명령과 refresh rotation 실패 테스트를 작성한다**

```ts
/** Cognito 비밀번호·TOTP·회전 refresh 명령을 검증한다 */
import { describe, expect, it, vi } from 'vitest';
import {
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  GetTokensFromRefreshTokenCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoAuthenticationProvider } from './cognito-authentication.provider.js';

describe('CognitoAuthenticationProvider', () => {
  it('SOFTWARE_TOKEN_MFA를 token이 아닌 challenge로 반환한다', async () => {
    const send = vi.fn().mockResolvedValue({
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: 'cognito-session',
    });
    const provider = new CognitoAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await expect(
      provider.login('admin@example.com', 'Strong1!'),
    ).resolves.toEqual({
      kind: 'MFA_REQUIRED',
      challengeToken: 'cognito-session',
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(AdminInitiateAuthCommand);
  });

  it('TOTP 설정 확인 뒤 preference를 SOFTWARE_TOKEN_MFA로 지정한다', async () => {
    const send = vi.fn().mockResolvedValueOnce({ Status: 'SUCCESS' });
    const provider = new CognitoAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await provider.verifyTotpSetup('access', '123456');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(
      VerifySoftwareTokenCommand,
    );
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(
      SetUserMFAPreferenceCommand,
    );
  });

  it('회전 refresh 응답에 새 refresh token이 없으면 실패한다', async () => {
    const send = vi.fn().mockResolvedValue({
      AuthenticationResult: {
        AccessToken: 'access',
        IdToken: 'header.payload.signature',
        ExpiresIn: 900,
      },
    });
    const provider = new CognitoAuthenticationProvider(
      { send } as never,
      'pool',
      'client',
    );

    await expect(provider.refresh('old-refresh')).rejects.toMatchObject({
      code: 'AUTH_CONFIGURATION_ERROR',
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(
      GetTokensFromRefreshTokenCommand,
    );
  });
});
```

- [ ] **Step 2: provider 테스트가 새 adapter를 찾지 못해 실패하는지 확인한다**

Run:

```bash
pnpm --filter @flex-thia/providers test
```

Expected: FAIL with 새 provider module 미존재 오류

- [ ] **Step 3: Cognito adapter를 구현한다**

구현 명령 연결은 다음과 같이 고정한다.

| 동작 | AWS SDK command |
| --- | --- |
| 비밀번호 로그인 | `AdminInitiateAuthCommand` |
| TOTP 로그인 완료 | `AdminRespondToAuthChallengeCommand` |
| TOTP secret 생성 | `AssociateSoftwareTokenCommand` |
| TOTP code 확인 | `VerifySoftwareTokenCommand` |
| TOTP 기본 MFA 설정 | `SetUserMFAPreferenceCommand` |
| token 회전 | `GetTokensFromRefreshTokenCommand` |
| logout revoke | `RevokeTokenCommand` |

TOTP 로그인 응답은 다음 입력을 사용한다.

```ts
new AdminRespondToAuthChallengeCommand({
  UserPoolId: this.userPoolId,
  ClientId: this.clientId,
  ChallengeName: 'SOFTWARE_TOKEN_MFA',
  Session: input.challengeToken,
  ChallengeResponses: {
    USERNAME: input.email,
    SOFTWARE_TOKEN_MFA_CODE: input.code,
  },
});
```

`GetTokensFromRefreshTokenCommand` 결과는 `AccessToken`, `IdToken`,
`RefreshToken`, `ExpiresIn`이 모두 있어야 성공이다. 기존 refresh token을
fallback으로 재사용하지 않는다.

Cognito의 `TooManyRequestsException`은 `AUTH_RATE_LIMITED`로 변환한다.
사용자 없음, 비밀번호 오류, MFA session 오류의 AWS 상세 이름은 공개하지
않고 각각 설계된 안정 오류 code로 변환한다.

- [ ] **Step 4: pre-provisioned local fake를 구현한다**

`FakeAuthenticationProvider` 생성자는 다음 입력을 받는다.

```ts
export interface FakeAuthenticationOptions {
  email: string;
  password: string;
  subject: string;
  requireTotp: boolean;
}
```

비밀번호는 `scryptSync` digest만 메모리에 저장한다. `requireTotp`이면
비밀번호 성공 뒤 `MFA_REQUIRED`를 반환하고 code `123456`만 challenge
완료로 인정한다. refresh할 때마다 증가하는 suffix를 붙인 새 access와
refresh token을 반환하고 revoke한 token은 재사용을 거부한다.

- [ ] **Step 5: provider 테스트와 typecheck를 통과시킨다**

Run:

```bash
pnpm --filter @flex-thia/providers test
pnpm --filter @flex-thia/providers typecheck
```

Expected: 두 명령 모두 exit 0

- [ ] **Step 6: identity adapter를 커밋한다**

```bash
git add backend/providers/src
git commit -m "feat: add cognito totp authentication adapter"
```

---

### Task 4: 사용자 MFA 상태와 migration

**Files:**

- Modify: `backend/database/src/schema/identity.schema.ts`
- Modify: `backend/database/src/schema/schema.spec.ts`
- Modify: `backend/database/src/repositories/drizzle-user.repository.ts`
- Modify: `backend/database/src/repositories/drizzle-auth.repository.spec.ts`
- Modify: `backend/domain/src/auth/user.repository.ts`
- Create: `backend/database/drizzle/0002_identity-mfa.sql`
- Create: `backend/database/drizzle/meta/0002_snapshot.json`
- Modify: `backend/database/drizzle/meta/_journal.json`

**Interfaces:**

- Implements: `IdentityUserRepository`
- Preserves: legacy `UserRepository`와 `phoneVerifiedAt`
- Produces: `DrizzleUserRepository.markMfaEnrolled(subject, enrolledAt)`

- [ ] **Step 1: schema와 repository 실패 테스트를 작성한다**

`schema.spec.ts`에 다음 검증을 추가한다.

```ts
it('사용자는 관리자 TOTP 등록 완료 시각을 가진다', () => {
  expect(Object.keys(getTableColumns(users))).toContain('mfaEnrolledAt');
});
```

repository 테스트에는 `update(users).set(...).where(...).returning()`이
호출되고 `mfaEnrolledAt`과 `updatedAt`이 같은 시각인지 검증한다.

- [ ] **Step 2: database 테스트가 column 미존재로 실패하는지 확인한다**

Run:

```bash
pnpm --filter @flex-thia/database test
```

Expected: FAIL because `mfaEnrolledAt` is absent

- [ ] **Step 3: users schema와 두 repository interface를 호환되게 확장한다**

`users`에 다음 column을 추가한다.

```ts
mfaEnrolledAt: timestamp('mfa_enrolled_at', { withTimezone: true }),
```

legacy `ApplicationUser`에도 `mfaEnrolledAt: Date | null`을 추가한다.
`DrizzleUserRepository`는 `UserRepository`와 `IdentityUserRepository`를
함께 구현하며 조회·upsert 결과에 `mfaEnrolledAt`을 포함한다.

```ts
/** Cognito TOTP 확인 성공 시각을 사용자 상태에 반영한다 */
async markMfaEnrolled(
  subject: string,
  enrolledAt: Date,
): Promise<ApplicationUser> {
  const [row] = await this.database
    .update(users)
    .set({ mfaEnrolledAt: enrolledAt, updatedAt: enrolledAt })
    .where(eq(users.cognitoSub, subject))
    .returning();

  if (!row) {
    throw new Error(`사용자를 찾을 수 없습니다: ${subject}`);
  }
  return toApplicationUser(row);
}
```

- [ ] **Step 4: 이름이 고정된 Drizzle migration을 생성한다**

Run:

```bash
pnpm --filter @flex-thia/database exec drizzle-kit generate --config drizzle.local.config.ts --name identity-mfa
```

Expected:

- `backend/database/drizzle/0002_identity-mfa.sql` 생성
- SQL은 `users.mfa_enrolled_at timestamptz` 추가만 포함
- `auth_challenges`, `step_up_challenges`, `step_up_grants` DROP 없음

- [ ] **Step 5: database 테스트와 typecheck를 통과시킨다**

Run:

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
```

Expected: 두 명령 모두 exit 0

- [ ] **Step 6: schema와 migration을 커밋한다**

```bash
git add backend/domain/src/auth/user.repository.ts backend/database
git commit -m "feat: store administrator totp enrollment"
```

---

### Task 5: NestJS identity Controller와 보안 guard

**Files:**

- Create: `backend/api/src/identity/identity.controller.ts`
- Create: `backend/api/src/identity/identity.controller.spec.ts`
- Create: `backend/api/src/identity/me.controller.ts`
- Create: `backend/api/src/identity/identity.module.ts`
- Create: `backend/api/src/identity/refresh-cookie.ts`
- Create: `backend/api/src/identity/cognito-authorizer.guard.ts`
- Create: `backend/api/src/identity/application-role.guard.ts`
- Create: `backend/api/src/identity/admin-mfa.guard.ts`
- Create: `backend/api/src/identity/csrf.guard.ts`
- Create: `backend/api/src/identity/require-role.decorator.ts`
- Create: `backend/api/src/identity/identity.guards.spec.ts`
- Modify: `backend/api/src/common/auth/current-user.decorator.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.spec.ts`
- Modify: `backend/api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes:
  - Task 1의 Zod schema
  - Task 2의 `IdentityAuthenticationService`
  - Task 4의 `IdentityUserRepository`
- Produces:
  - `/api/v1/auth/login`
  - `/api/v1/auth/mfa/totp/challenge`
  - `/api/v1/auth/mfa/totp/setup`
  - `/api/v1/auth/mfa/totp/setup/verify`
  - `/api/v1/auth/refresh`
  - `/api/v1/auth/logout`
  - `/api/v1/me`
  - `CognitoAuthorizerGuard`, `ApplicationRoleGuard`, `AdminMfaGuard`

- [ ] **Step 1: cookie·역할 상속·MFA·Controller 실패 테스트를 작성한다**

필수 assertion은 다음과 같다.

```ts
import { describe, expect, it, vi } from 'vitest';
import { AdminMfaGuard } from './admin-mfa.guard.js';
import { ApplicationRoleGuard } from './application-role.guard.js';
import { writeRefreshCookie } from './refresh-cookie.js';

const createContext = (request: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as never;

describe('refresh cookie', () => {
  it('7일 Strict __Host- cookie로만 refresh token을 저장한다', () => {
    const response = { cookie: vi.fn() };
    writeRefreshCookie(response, 'refresh');

    expect(response.cookie).toHaveBeenCalledWith(
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
  });
});

describe('ApplicationRoleGuard', () => {
  it('ADMIN은 LEARNER 요구 route를 사용할 수 있다', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('LEARNER'),
    };
    const guard = new ApplicationRoleGuard(reflector as never);

    expect(
      guard.canActivate(
        createContext({
          user: {
            userId: 'user-id',
            sub: 'cognito-sub',
            email: 'admin@example.com',
            role: 'ADMIN',
            mfaEnrolledAt: new Date('2026-07-23T00:00:00.000Z'),
          },
        }),
      ),
    ).toBe(true);
  });
});

describe('AdminMfaGuard', () => {
  it('ADMIN이 TOTP 등록 전이면 관리자 route를 거부한다', () => {
    const guard = new AdminMfaGuard();
    try {
      guard.canActivate(
        createContext({
          user: {
            userId: 'user-id',
            sub: 'cognito-sub',
            email: 'admin@example.com',
            role: 'ADMIN',
            mfaEnrolledAt: null,
          },
        }),
      );
      throw new Error('MFA 미등록 요청이 통과했습니다');
    } catch (error) {
      expect(error).toMatchObject({
        status: 403,
        response: { code: 'MFA_ENROLLMENT_REQUIRED' },
      });
    }
  });
});
```

Controller 테스트는 다음을 검증한다.

- signup·password reset method가 존재하지 않는다.
- 로그인 성공이 refresh cookie를 쓰고 refresh token을 body에서 제거한다.
- `MFA_REQUIRED`는 cookie를 쓰지 않는다.
- refresh token이 없으면 `401 INVALID_REFRESH_TOKEN`이다.
- logout이 revoke 후 같은 속성으로 cookie를 삭제한다.
- setup verify는 현재 사용자의 sub와 bearer access token을 use case에
  전달한다.

- [ ] **Step 2: API identity 테스트가 새 파일 미존재로 실패하는지 확인한다**

Run:

```bash
pnpm --filter @flex-thia/api test
```

Expected: FAIL with identity module 또는 cookie helper 미존재 오류

- [ ] **Step 3: API가 Zod 오류를 직접 판별할 dependency를 선언한다**

Run:

```bash
pnpm --filter @flex-thia/api add zod@^4.1.0
```

Expected: `backend/api/package.json`과 `pnpm-lock.yaml`에 Zod 4 dependency 반영

- [ ] **Step 4: cookie helper와 Controller를 구현한다**

```ts
/** refresh token cookie 이름과 보안 속성을 한 곳에서 관리한다 */
export const REFRESH_COOKIE_NAME = '__Host-flex-thia-refresh';
export const REFRESH_COOKIE_OPTIONS = {
  secure: true,
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
} as const;
```

`IdentityController`는 Zod `parse` 뒤 domain use case를 호출한다.
`AUTHENTICATED` 결과는 refresh token을 cookie에 쓰고 body에는 access
token, expiresIn, 공개 사용자만 반환한다. `MFA_REQUIRED`는 challenge만
반환한다.

TOTP setup 두 endpoint는 `CognitoAuthorizerGuard`,
`ApplicationRoleGuard`, `@RequireRole('ADMIN')`을 사용한다. 등록 전에도
접근해야 하므로 setup 두 endpoint에는 `AdminMfaGuard`를 적용하지 않는다.
Authorization header의 `Bearer ` 뒤 원문 access token을 Cognito 설정
호출에만 전달하고 로그나 DB에 저장하지 않는다.

- [ ] **Step 5: 역할·MFA·CSRF guard를 구현한다**

`AuthenticatedUser`는 다음 필드를 가진다.

```ts
export interface AuthenticatedUser {
  userId: string;
  sub: string;
  email: string;
  role: 'LEARNER' | 'ADMIN';
  mfaEnrolledAt: Date | null;
}
```

역할 포함 규칙은 상수로 명시한다.

```ts
const ROLE_LEVEL = { LEARNER: 1, ADMIN: 2 } as const;
return ROLE_LEVEL[currentRole] >= ROLE_LEVEL[requiredRole];
```

`AdminMfaGuard`는 요구 역할이 `ADMIN`인 route에서
`mfaEnrolledAt === null`이면 `403 MFA_ENROLLMENT_REQUIRED`를 던진다.
`CsrfGuard`는 exact Origin과 `X-CSRF-Protection: 1`을 모두 요구한다.

- [ ] **Step 6: problem details filter를 구현한다**

`IdentityDomainError`와 Zod 오류를 다음 규칙으로 변환한다.

| code | HTTP |
| --- | --- |
| `INVALID_CREDENTIALS` | 401 |
| `INVALID_MFA_CHALLENGE` | 401 |
| `INVALID_TOTP` | 401 |
| `INVALID_REFRESH_TOKEN` | 401 |
| `AUTH_RATE_LIMITED` | 429 |
| `MFA_ENROLLMENT_REQUIRED` | 403 |
| `ACCOUNT_DISABLED` | 403 |
| Zod request 오류 | 400 |

응답 Content-Type은 `application/problem+json`이고 body는 Task 1의
`problemDetailsSchema`를 만족해야 한다. 비밀번호, token, TOTP, Cognito
오류 원문은 message와 log metadata에 포함하지 않는다.

- [ ] **Step 7: identity API 테스트와 typecheck를 통과시킨다**

Run:

```bash
pnpm --filter @flex-thia/api test
pnpm --filter @flex-thia/api typecheck
```

Expected: 두 명령 모두 exit 0

- [ ] **Step 8: NestJS identity 경계를 커밋한다**

```bash
git add backend/api/src/identity backend/api/src/common backend/api/package.json pnpm-lock.yaml
git commit -m "feat: add secure identity http api"
```

---

### Task 6: 애플리케이션 조립 전환과 legacy HTTP 격리

**Files:**

- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/app.module.spec.ts`
- Modify: `backend/api/src/app.setup.ts`
- Create: `backend/api/src/app.setup.spec.ts`
- Modify: `backend/api/src/runtime-config.ts`
- Modify: `backend/api/src/runtime-config.spec.ts`
- Modify: `backend/api/src/jobs/jobs.controller.ts`
- Modify: `backend/api/src/uploads/uploads.controller.ts`
- Modify: `backend/config/src/api-env.ts`
- Modify: `backend/config/src/api-env.spec.ts`
- Modify: `.env.example`
- Delete: `backend/api/src/auth/auth.controller.ts`
- Delete: `backend/api/src/auth/auth.controller.spec.ts`
- Delete: `backend/api/src/auth/auth.module.ts`
- Delete: `backend/api/src/auth/auth.guards.spec.ts`
- Delete: `backend/api/src/auth/application-role.guard.ts`
- Delete: `backend/api/src/auth/cognito-authorizer.guard.ts`
- Delete: `backend/api/src/auth/csrf.guard.ts`
- Delete: `backend/api/src/auth/require-role.decorator.ts`
- Delete: `backend/api/src/auth/phone-verification.controller.ts`
- Delete: `backend/api/src/auth/step-up.controller.ts`
- Delete: `backend/api/src/auth/step-up.controller.spec.ts`

**Interfaces:**

- Consumes:
  - `IdentityAuthenticationService`
  - `CognitoAuthenticationProvider`
  - `FakeAuthenticationProvider`
  - `IdentityModule.register`
- Produces:
  - root application에 활성화된 `IdentityModule`
  - versioned `/api/v1` 기능 경로와 비 versioned `/health`, `/ready`

- [ ] **Step 1: root module과 global prefix 실패 테스트를 수정한다**

`app.module.spec.ts`는 local 설정에서 root imports가 `IdentityModule` 하나고
health·readiness Controller 두 개가 유지되는지 검증한다. Nest metadata의
Controller 목록에 legacy `AuthController`, `JobsController`,
`UploadsController`가 없음을 검증한다.

`app.setup` 테스트는 `/health`, `/ready`만 prefix에서 제외하고 나머지
경로에 `api/v1`이 적용되는지 검증한다.

- [ ] **Step 2: 수정한 API·config 테스트가 기존 조립 때문에 실패하는지 확인한다**

Run:

```bash
pnpm --filter @flex-thia/config test
pnpm --filter @flex-thia/api test
```

Expected:

- config 또는 app module assertion FAIL
- root imports 길이가 기존 `3`으로 보고됨

- [ ] **Step 3: root module을 identity와 health만 조립하도록 단순화한다**

`createApplicationModule`은 DB, `DrizzleUserRepository`, Cognito 또는 fake,
`IdentityAuthenticationService`만 인증 경계에 생성한다.

```ts
const authenticationProvider =
  env.AUTH_MODE === 'cognito'
    ? new CognitoAuthenticationProvider(
        new CognitoIdentityProviderClient({ region: env.AWS_REGION }),
        requireValue(env.COGNITO_USER_POOL_ID, 'COGNITO_USER_POOL_ID'),
        requireValue(env.COGNITO_CLIENT_ID, 'COGNITO_CLIENT_ID'),
      )
    : new FakeAuthenticationProvider({
        email: env.FAKE_USER_EMAIL,
        password: env.FAKE_USER_PASSWORD,
        subject: env.FAKE_USER_SUB,
        requireTotp: true,
      });

const identity = new IdentityAuthenticationService(
  authenticationProvider,
  users,
);
```

root `imports`에는 `IdentityModule.register(...)`만 둔다. `JobsModule`,
`UploadsModule`, SES, SNS, SQS, SSM, phone, challenge, step-up 생성 코드를
제거한다. Job·upload 파일과 DB schema는 삭제하지 않는다.

- [ ] **Step 4: global prefix와 설정을 MVP 기준으로 바꾼다**

`configureApp`에 다음 prefix를 추가한다.

```ts
app.setGlobalPrefix('api/v1', {
  exclude: [
    { path: 'health', method: RequestMethod.GET },
    { path: 'ready', method: RequestMethod.GET },
  ],
});
```

`ApiEnv`에는 `FAKE_USER_PASSWORD` 기본값 `LocalOnly1!`을 추가한다.
production 필수값은 DB resource ARN, DB secret ARN, Cognito pool ID,
Cognito client ID만 검사한다. 기존 Job·upload·challenge 환경 변수는
인프라 정리 전까지 optional 입력으로 허용하지만 애플리케이션 조립에서는
읽지 않는다.

`loadApiRuntimeSource`는 Secrets Manager pepper를 읽지 않고 입력 객체의
복사본만 반환한다. runtime config 테스트는 secret reader가 호출되지
않음을 검증한다.

- [ ] **Step 5: legacy HTTP 파일을 제거하고 deferred Controller import를 갱신한다**

파일 맵의 legacy auth Controller·module·guard를 삭제한다.
`jobs.controller.ts`와 `uploads.controller.ts`의 role·authorizer import는
새 `backend/api/src/identity` 경로로 바꾼다. 두 Controller는 root module에
등록하지 않으므로 HTTP에서 도달할 수 없다.

`backend/api/src/auth/require-step-up.decorator.ts`,
`require-step-up.guard.ts`, 해당 테스트는 기존 Job 코드가 compile되는
동안 유지한다.

- [ ] **Step 6: config와 API 전체 package 검증을 통과시킨다**

Run:

```bash
pnpm --filter @flex-thia/config test
pnpm --filter @flex-thia/config typecheck
pnpm --filter @flex-thia/api test
pnpm --filter @flex-thia/api typecheck
pnpm --filter @flex-thia/api build:lambda
```

Expected: 모든 명령 exit 0

- [ ] **Step 7: application identity 전환을 커밋한다**

```bash
git add .env.example backend/api backend/config
git commit -m "refactor: activate mvp identity boundary"
```

---

### Task 7: 문서와 전체 정적 검증

**Files:**

- Modify: `docs/development/backend-foundation.md`
- Modify: `docs/development/project-structure.md`

**Interfaces:**

- Documents:
  - 사전 준비 계정 로그인
  - local fake 관리자 자격 증명
  - TOTP 등록과 로그인 challenge
  - refresh cookie와 Vite proxy
  - 비활성화된 legacy 경로

- [ ] **Step 1: 개발 문서에서 제거된 공개 API를 찾는다**

Run:

```bash
rg -n "/auth/signup|password/forgot|phone/challenges|step-up/challenges" docs/development
```

Expected: `backend-foundation.md`의 기존 공개 가입·SMS 안내가 출력됨

- [ ] **Step 2: 현재 실행 경로와 보안 정책으로 문서를 갱신한다**

`backend-foundation.md`에서 signup·password reset·phone·SMS 예시를
제거하고 다음 요청 흐름을 적는다.

1. pre-provisioned 계정으로 `/api/v1/auth/login`
2. `MFA_REQUIRED`면 `/api/v1/auth/mfa/totp/challenge`
3. access token은 메모리에 보관
4. refresh와 logout은 credentials와 `X-CSRF-Protection: 1` 사용
5. local fake 계정은 `.env.example`의 email·password 사용

`project-structure.md`는 `backend/api/src/identity`가 활성 인증 경계고 남은
`backend/api/src/auth/require-step-up*`은 비활성 Job 호환 코드임을 반영한다.

- [ ] **Step 3: 제거된 공개 경로가 문서에 남지 않았는지 확인한다**

Run:

```bash
if rg -n "/auth/signup|password/forgot|phone/challenges|step-up/challenges" docs/development/backend-foundation.md; then exit 1; fi
```

Expected: exit 0 with no output

- [ ] **Step 4: 전체 저장소 검증을 실행한다**

Run:

```bash
pnpm check
```

Expected:

- Prettier errors 0
- ESLint errors 0
- TypeScript errors 0
- Vitest failures 0
- API와 worker Lambda bundle 성공
- workspace build 성공

이 명령은 배포나 인프라 synth를 실행하지 않는다.

- [ ] **Step 5: diff가 계획 범위 안인지 확인한다**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected:

- `infra/**` 변경 없음
- vocabulary·question·learning schema 변경 없음
- whitespace error 없음
- 계획의 생성·수정·삭제 파일만 표시

- [ ] **Step 6: identity MVP 애플리케이션 단계를 커밋한다**

```bash
git add docs/development/backend-foundation.md docs/development/project-structure.md
git commit -m "docs: explain mvp identity workflow"
```

---

### Task 8: Swagger·OpenAPI 문서화

**Files:**

- Create: `backend/api/src/openapi/openapi.decorators.ts`
- Create: `backend/api/src/openapi/openapi.dto.ts`
- Create: `backend/api/src/openapi/openapi.spec.ts`
- Create: `backend/api/src/openapi/openapi.ts`
- Create: `shared/contracts/src/health/status.ts`
- Modify: `backend/api/src/identity/identity.controller.ts`
- Modify: `backend/api/src/identity/me.controller.ts`
- Modify: `backend/api/src/health/health.controller.ts`
- Modify: `backend/api/src/health/readiness.service.ts`
- Modify: `backend/api/src/app.setup.ts`
- Modify: `backend/api/src/identity/cognito-authorizer.guard.ts`
- Modify: `backend/api/src/identity/csrf.guard.ts`
- Modify: `backend/api/src/identity/identity.module.ts`
- Modify: `backend/api/package.json`
- Modify: `shared/contracts/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces:
  - 비운영 Swagger UI `/api/docs`
  - 비운영 OpenAPI JSON `/api/openapi.json`
  - Identity·health 활성 endpoint 아홉 개의 OpenAPI 계약

- [x] **Step 1: 활성 endpoint의 OpenAPI document 실패 테스트를 작성한다**

테스트는 활성 path 아홉 개, Zod 요청·응답, Bearer·refresh cookie security
scheme, Problem Details와 logout `204`를 검사한다.

- [x] **Step 2: Zod 계약 기반 Swagger DTO와 Controller metadata를 구현한다**

`shared/contracts`의 Zod schema를 `nestjs-zod` DTO로 연결한다. 로그인
성공과 MFA challenge 응답은 두 DTO를 OpenAPI `oneOf`로 조합한다.

- [x] **Step 3: Guard 생성자에 명시적 Nest DI token을 적용한다**

class 기반 `@UseGuards`가 interface와 배열 생성자 인자를 안정적으로
해석하도록 사용자 repository, authorizer 설정과 CSRF origin에 Symbol
token을 사용한다.

- [x] **Step 4: 비운영 환경에만 Swagger route를 연결한다**

`production`에서는 Swagger 설정을 호출하지 않고, 그 밖의 환경에서
`/api/docs`와 `/api/openapi.json`을 등록한다.

- [x] **Step 5: OpenAPI·API 단위 테스트와 typecheck를 통과시킨다**

Run:

```bash
pnpm exec vitest run backend/api/src shared/contracts/src
pnpm --filter @flex-thia/api typecheck
pnpm --filter @flex-thia/contracts typecheck
```

Expected: 모든 명령 exit 0

---

## Completion Gate

다음 조건을 모두 만족해야 2단계 어휘·문장·음성 계획으로 넘어간다.

- 공개 signup·셀프 password reset·phone·SMS step-up Controller가 root
  application에 등록되지 않는다.
- 잘못된 자격 증명과 잘못된 MFA는 계정 존재 여부를 노출하지 않는다.
- Cognito refresh 응답에 새 refresh token이 없으면 기존 token을 재사용하지
  않고 실패한다.
- refresh cookie 속성이 설계와 정확히 일치한다.
- `ADMIN`이 `LEARNER` route를 사용할 수 있다.
- TOTP 미등록 관리자가 관리자 route를 사용할 수 없다.
- DB migration은 `mfa_enrolled_at`만 추가하고 기존 인증 테이블을 삭제하지
  않는다.
- Identity·health 활성 endpoint 아홉 개가 요청·응답·인증·오류를 포함한
  OpenAPI document에 존재하고 운영 환경에는 문서 route가 없다.
- `pnpm check`가 exit 0이다.
- 인프라, 배포, Lambda DI metadata는 변경하지 않는다.
