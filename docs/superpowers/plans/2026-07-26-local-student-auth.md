# Local Student Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 `test`와 `frontend-dev` 환경에서 관리자와 학생이 각자의 실제 subject로 로그인하고 역할에 맞는 화면과 API를 사용하게 한다.

**Architecture:** local fake provider가 두 계정과 발급 token의 subject 연결을 소유하고, fake Guard는 프록시 subject header 대신 Bearer token resolver를 사용한다. Cognito 분기와 공개 API 계약은 유지하며, 학생 개인 학습 시드만 학생 사용자에 연결한다.

**Tech Stack:** TypeScript, NestJS, Vitest, Vite, Nginx, Docker Compose, PostgreSQL seed SQL

## Global Constraints

- 관리자 계정은 `admin@hufs.ac.kr` / `qwer1234!@#` / MFA `123456`을 유지한다.
- 학생 계정은 `learner@hufs.ac.kr` / `qwer1234!@#`이며 MFA를 요구하지 않는다.
- 학생 subject는 `local-learner-sub`를 사용한다.
- 실제 Cognito 동작과 공개 로그인·`/me` API 계약을 변경하지 않는다.
- 로컬 개발용 fake 인증 범위만 최소 수정한다.
- 테스트 설명은 한국어로 작성한다.
- 브라우저·API E2E 테스트 파일이나 러너를 추가하지 않는다.
- 기존 미추적 파일 `docs/superpowers/plans/2026-07-25-frontend-mvp.md`를 변경하거나 커밋하지 않는다.

---

### Task 1: 다중 계정 fake 인증과 token subject 연결

**Files:**
- Modify: `backend/providers/src/identity/fake-authentication.provider.spec.ts`
- Modify: `backend/providers/src/identity/fake-authentication.provider.ts`

**Interfaces:**
- Consumes: `AuthenticationProvider.login`, `completeTotpChallenge`, `refresh`, `revoke`
- Produces: `FakeAuthenticationOptions.accounts: FakeAuthenticationAccountOptions[]`
- Produces: `FakeAuthenticationProvider.resolveAccessTokenSubject(accessToken: string): string | undefined`

- [ ] **Step 1: 학생 즉시 로그인과 계정별 token 연결 실패 테스트 작성**

```ts
const createProvider = () =>
  new FakeAuthenticationProvider({
    accounts: [
      {
        email: 'admin@example.com',
        password: 'Strong1!',
        subject: 'admin-sub',
        requireTotp: true,
      },
      {
        email: 'learner@example.com',
        password: 'Strong1!',
        subject: 'learner-sub',
        requireTotp: false,
      },
    ],
  });

it('학생은 MFA 없이 자신의 subject로 로그인한다', async () => {
  const provider = createProvider();
  const result = await provider.login('learner@example.com', 'Strong1!');

  expect(result).toMatchObject({
    kind: 'AUTHENTICATED',
    tokens: { subject: 'learner-sub', email: 'learner@example.com' },
  });
  if (result.kind !== 'AUTHENTICATED') throw new Error('즉시 인증 결과가 필요합니다');
  expect(provider.resolveAccessTokenSubject(result.tokens.accessToken)).toBe(
    'learner-sub',
  );
});

it('refresh 뒤에도 로그인한 계정의 subject를 유지한다', async () => {
  const provider = createProvider();
  const login = await provider.login('learner@example.com', 'Strong1!');
  if (login.kind !== 'AUTHENTICATED') throw new Error('즉시 인증 결과가 필요합니다');

  const refreshed = await provider.refresh(login.tokens.refreshToken);

  expect(refreshed).toMatchObject({
    subject: 'learner-sub',
    email: 'learner@example.com',
  });
  expect(provider.resolveAccessTokenSubject(refreshed.accessToken)).toBe(
    'learner-sub',
  );
  expect(provider.resolveAccessTokenSubject('unknown')).toBeUndefined();
});
```

- [ ] **Step 2: provider 테스트가 새 options와 resolver 부재로 실패하는지 확인**

Run: `pnpm --filter @flex-thia/providers test -- backend/providers/src/identity/fake-authentication.provider.spec.ts`

Expected: FAIL — `accounts` options 또는 `resolveAccessTokenSubject`가 구현되지 않음

- [ ] **Step 3: 계정별 digest와 token 연결을 최소 구현**

```ts
/** local fake에 사전 준비할 계정별 인증 설정 */
export interface FakeAuthenticationAccountOptions {
  email: string;
  password: string;
  subject: string;
  requireTotp: boolean;
}

/** local fake가 함께 제공할 사전 준비 계정 목록 */
export interface FakeAuthenticationOptions {
  accounts: FakeAuthenticationAccountOptions[];
}

type PreparedAccount = FakeAuthenticationAccountOptions & {
  passwordDigest: Buffer;
  salt: Buffer;
};

private readonly accounts = new Map<string, PreparedAccount>();
private readonly accessTokenSubjects = new Map<string, string>();
private readonly challenges = new Map<string, PreparedAccount>();
private readonly refreshTokenAccounts = new Map<string, PreparedAccount>();

/** 발급한 local access token에 연결된 subject만 반환한다 */
resolveAccessTokenSubject(accessToken: string): string | undefined {
  return this.accessTokenSubjects.get(accessToken);
}
```

생성자에서 계정별 salt와 digest를 만들고, `login`은 이메일로 계정을 선택한
뒤 해당 digest를 검증한다. `issueTokens(account)`는 access token→subject와
refresh token→account를 저장한다. MFA challenge와 refresh도 저장된 account를
`issueTokens`에 전달한다.

- [ ] **Step 4: provider 관련 테스트 통과 확인**

Run: `pnpm --filter @flex-thia/providers test -- backend/providers/src/identity/fake-authentication.provider.spec.ts`

Expected: PASS

- [ ] **Step 5: fake provider 변경 커밋 준비**

이 task는 Guard와 root 조립이 완료된 Task 2 끝에서 함께 커밋한다.

---

### Task 2: Bearer token 기반 fake Guard와 두 계정 조립

**Files:**
- Modify: `backend/api/src/identity/identity.guards.spec.ts`
- Modify: `backend/api/src/identity/cognito-authorizer.guard.ts`
- Modify: `backend/config/src/api-env.spec.ts`
- Modify: `backend/config/src/api-env.ts`
- Modify: `backend/api/src/app.module.spec.ts`
- Modify: `backend/api/src/app.module.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `FakeAuthenticationProvider.resolveAccessTokenSubject`
- Produces: `AuthorizerGuardOptions.resolveFakeAccessTokenSubject?: (accessToken: string) => string | undefined`
- Produces: `FAKE_LEARNER_SUB`, `FAKE_LEARNER_EMAIL`, `FAKE_LEARNER_PASSWORD`

- [ ] **Step 1: fake Guard가 Authorization token의 resolver 결과를 쓰는 실패 테스트 작성**

```ts
it('fake access token에 연결된 subject를 최신 DB 사용자와 연결한다', async () => {
  const users = {
    findBySub: vi.fn().mockResolvedValue({
      id: 'learner-id',
      cognitoSub: 'local-learner-sub',
      email: 'learner@hufs.ac.kr',
      role: 'LEARNER',
      status: 'ACTIVE',
      mfaEnrolledAt: null,
    }),
  };
  const resolveFakeAccessTokenSubject = vi
    .fn()
    .mockReturnValue('local-learner-sub');
  const guard = new CognitoAuthorizerGuard(users as never, {
    authMode: 'fake',
    cognitoClientId: 'local-client',
    nodeEnv: 'development',
    resolveFakeAccessTokenSubject,
  });
  const request = {
    headers: {
      authorization: 'Bearer learner-access',
      'x-dev-user-sub': 'local-admin-sub',
    },
  };

  await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  expect(resolveFakeAccessTokenSubject).toHaveBeenCalledWith('learner-access');
  expect(users.findBySub).toHaveBeenCalledWith('local-learner-sub');
  expect(request).toMatchObject({ user: { role: 'LEARNER' } });
});
```

알 수 없는 token, Bearer token 누락, production fake 모드도 401인지 같은
`describe`에 한국어 설명으로 검증한다.

- [ ] **Step 2: Guard 테스트의 예상 실패 확인**

Run: `pnpm --filter @flex-thia/api test -- backend/api/src/identity/identity.guards.spec.ts`

Expected: FAIL — options에 resolver가 없고 Guard가 고정 header를 사용함

- [ ] **Step 3: fake Guard를 Bearer resolver로 최소 변경**

```ts
export interface AuthorizerGuardOptions {
  authMode: 'fake' | 'cognito';
  cognitoClientId: string;
  nodeEnv?: 'development' | 'test' | 'production';
  resolveFakeAccessTokenSubject?: (
    accessToken: string,
  ) => string | undefined;
}
```

`readFakeSubject`는 production을 먼저 거부하고, 정확한 `Bearer <token>`을
읽어 resolver를 호출한다. resolver가 없거나 subject를 반환하지 않으면
`UnauthorizedException`을 던진다. `x-dev-user-sub`는 읽지 않는다.

- [ ] **Step 4: 학생 환경 기본값 실패 테스트 작성**

```ts
it('local fake 관리자와 학생 계정 기본값을 제공한다', () => {
  expect(readApiEnv({})).toMatchObject({
    FAKE_USER_SUB: 'local-admin-sub',
    FAKE_USER_EMAIL: 'admin@hufs.ac.kr',
    FAKE_USER_PASSWORD: 'qwer1234!@#',
    FAKE_LEARNER_SUB: 'local-learner-sub',
    FAKE_LEARNER_EMAIL: 'learner@hufs.ac.kr',
    FAKE_LEARNER_PASSWORD: 'qwer1234!@#',
  });
});
```

- [ ] **Step 5: config 테스트의 예상 실패 확인**

Run: `pnpm --filter @flex-thia/config test -- backend/config/src/api-env.spec.ts`

Expected: FAIL — learner 환경 값이 없고 관리자 기본 비밀번호가 다름

- [ ] **Step 6: fake 학생 환경 값과 root 조립 최소 구현**

`api-env.ts`, `.env.example`, `app.module.ts`에 세 learner 환경 값을 추가한다.
root module은 두 계정으로 `FakeAuthenticationProvider`를 만들고, fake
provider의 `resolveAccessTokenSubject`를 호출하는 closure를 세 feature
module이 공유하는 `authorizer` options에 넣는다. Cognito 분기에는 resolver를
넣지 않는다.

- [ ] **Step 7: root module 조립 테스트에서 두 계정 로그인과 resolver 확인**

Identity module의 `IdentityAuthenticationService` provider를 찾아 관리자
로그인이 `MFA_REQUIRED`, 학생 로그인이 `AUTHENTICATED`인지 확인한다.
`AUTHORIZER_GUARD_OPTIONS` provider의 resolver가 학생 access token을
`local-learner-sub`로 해석하는지도 확인한다.

- [ ] **Step 8: 관련 workspace 테스트와 typecheck 통과 확인**

Run: `pnpm --filter @flex-thia/providers test && pnpm --filter @flex-thia/config test && pnpm --filter @flex-thia/api test && pnpm --filter @flex-thia/providers typecheck && pnpm --filter @flex-thia/config typecheck && pnpm --filter @flex-thia/api typecheck`

Expected: PASS

- [ ] **Step 9: 인증 구현 커밋**

```bash
git add .env.example backend/providers/src/identity/fake-authentication.provider.ts backend/providers/src/identity/fake-authentication.provider.spec.ts backend/api/src/identity/cognito-authorizer.guard.ts backend/api/src/identity/identity.guards.spec.ts backend/config/src/api-env.ts backend/config/src/api-env.spec.ts backend/api/src/app.module.ts backend/api/src/app.module.spec.ts
git commit -m "feat(local-auth): support admin and learner subjects"
```

---

### Task 3: 역할에 맞는 시드 연결과 두 Docker 프로필 프록시

**Files:**
- Modify: `backend/database/src/commands/reset-seed-local.spec.ts`
- Modify: `backend/database/seed/local.sql`
- Modify: `compose.yaml`
- Modify: `frontend/web/vite.config.ts`
- Modify: `docker/nginx.local.conf`

**Interfaces:**
- Consumes: 관리자 user ID `00000000-0000-4000-8000-000000000001`
- Produces: 학생 user ID `00000000-0000-4000-8000-000000000002`
- Produces: 프록시가 Authorization header를 그대로 전달하는 `/api` 경로

- [ ] **Step 1: 시드 역할 연결 실패 테스트 작성**

`reset-seed-local.spec.ts`에서 `backend/database/seed/local.sql`을 읽고 다음을
검증한다.

```ts
it('학생 개인 데이터와 관리자 작업을 역할에 맞는 사용자에게 연결한다', async () => {
  const seedSql = await readFile(
    new URL('../../seed/local.sql', import.meta.url),
    'utf8',
  );

  expect(seedSql).toContain("'local-learner-sub'");
  expect(seedSql).toContain("'learner@hufs.ac.kr'");
  expect(seedSql.match(/00000000-0000-4000-8000-000000000002/gu)).toHaveLength(
    4,
  );
  expect(seedSql).toMatch(
    /insert into content_imports[\s\S]*?'00000000-0000-4000-8000-000000000001'/u,
  );
});
```

학생 ID 네 번은 users row, question attempt, saved question, saved vocabulary를
의미한다.

- [ ] **Step 2: database 테스트의 예상 실패 확인**

Run: `pnpm --filter @flex-thia/database test -- backend/database/src/commands/reset-seed-local.spec.ts`

Expected: FAIL — learner 시드와 학생 ID 연결이 없음

- [ ] **Step 3: 학생 사용자와 개인 학습 데이터 연결 최소 수정**

`users` insert를 두 row values로 바꾸고 학생 row에는 role `LEARNER`, status
`ACTIVE`, `phone_verified_at`과 `mfa_enrolled_at`은 null을 사용한다.
`question_attempts`, `saved_questions`, `saved_vocabularies`의 user ID만 학생
ID로 바꾸며 `content_imports.requested_by`는 관리자 ID를 유지한다.

- [ ] **Step 4: 두 Compose 프로필 계정 설정과 고정 header 제거**

`compose.yaml` 공통 환경에 learner 세 값을 추가한다. Vite와 Nginx에서
`X-Dev-User-Sub local-admin-sub` 설정을 삭제하되 proxy target, Host와 SPA
fallback은 유지한다.

- [ ] **Step 5: 시드 테스트와 Compose 정적 구성 검증**

Run: `pnpm --filter @flex-thia/database test -- backend/database/src/commands/reset-seed-local.spec.ts`

Expected: PASS

Run: `docker compose --profile test config`

Expected: `db-setup`, `api`, `web`이 렌더링되고 api에 관리자·학생 환경 값이 있음

Run: `docker compose --profile frontend-dev config`

Expected: `db-setup`, `api`가 렌더링되고 api에 관리자·학생 환경 값이 있음

- [ ] **Step 6: 시드·프로필 구현 커밋**

```bash
git add backend/database/src/commands/reset-seed-local.spec.ts backend/database/seed/local.sql compose.yaml frontend/web/vite.config.ts docker/nginx.local.conf
git commit -m "feat(local): connect learner seed and proxy authentication"
```

---

### Task 4: 전체 회귀와 실행 환경 검증

**Files:**
- No source changes expected

**Interfaces:**
- Verifies: 로그인, `/me`, 학생 API, 관리자 API, frontend route 분리

- [ ] **Step 1: 정적 품질 검증**

Run: `pnpm structure:check && pnpm format:check && pnpm architecture:check && pnpm lint && pnpm typecheck`

Expected: PASS

- [ ] **Step 2: 관련 단위·컴포넌트 테스트**

Run: `pnpm --filter @flex-thia/providers test && pnpm --filter @flex-thia/config test && pnpm --filter @flex-thia/database test && pnpm --filter @flex-thia/api test && pnpm --filter @flex-thia/web test`

Expected: PASS

- [ ] **Step 3: `test` 프로필 실행 후 관리자 흐름 확인**

`docker compose --profile test up --build -d`로 로컬 환경을 시작한다.
관리자 로그인은 `MFA_REQUIRED`, code `123456` 완료 뒤 `/api/v1/me`가
`admin@hufs.ac.kr`, `ADMIN`, `mfaEnrolled: true`를 반환하는지 curl로 확인한다.
관리자 endpoint가 성공하고 프론트 `/admin`이 제공되는지 확인한다.

- [ ] **Step 4: 학생 흐름과 역할 분리 확인**

학생 로그인은 즉시 `AUTHENTICATED`이고 `/api/v1/me`가
`learner@hufs.ac.kr`, `LEARNER`, `mfaEnrolled: false`를 반환해야 한다.
학생 token으로 학습 API를 호출해 성공하고 관리자 API 호출이 403인지
확인한다. 프론트 라우팅 단위 테스트와 실행 화면에서 `/learn`,
`/questions`, `/history`, `/vocabularies`, `/saved-vocabularies` 접근을
확인한다.

- [ ] **Step 5: `frontend-dev` 프로필 확인**

`test` 프로필을 종료한 뒤 `docker compose --profile frontend-dev up --build -d`
로 API와 DB를 시작하고 host Vite dev proxy를 통해 학생 로그인과 `/me`를
다시 확인한다.

- [ ] **Step 6: 작업 컨테이너 정리와 최종 diff 확인**

검증에 시작한 Compose 서비스만 종료한다. `git diff --check`,
`git status --short`, `git log --oneline`으로 사용자 파일이 커밋되지 않았고
요청 범위의 논리적 커밋만 남았는지 확인한다.

