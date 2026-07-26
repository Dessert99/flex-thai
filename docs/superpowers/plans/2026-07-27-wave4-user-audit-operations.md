# Wave 4 User Audit Operations 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 사용자를 검색·필터·페이지 조회하고 상태·역할을 안전하게 변경하며, TOTP 등록 상태와 감사 기록 목록·상세·최근 변경을 확인하게 한다.

**Architecture:** `identity`가 사용자 역할·상태와 잠금 방지 command를, `operations`가 기존 append-only `audit_logs`의 read query를 소유한다. 공개 계약은 Zod, 규칙은 domain service, 검색과 원자 변경은 Drizzle/PostgreSQL, HTTP는 NestJS ADMIN guard, 화면은 URL 소유 필터와 TanStack Query로 구현한다. 기능 브랜치는 leaf 기능 파일만 만들고 공용 export·AppModule·OpenAPI·infra·migration·navigation·관리자 홈은 통합 브랜치가 직렬로 연결한다.

**Tech Stack:** TypeScript, Zod 4, NestJS 11, Drizzle ORM 0.45, PostgreSQL 16, React 19, TanStack Router/Query, shadcn/ui, Vitest 4

## Global Constraints

- 기준선은 local `main`의 `4816cbc`다.
- 역할은 `LEARNER | ADMIN`, 상태는 `ACTIVE | DISABLED`만 사용한다.
- 관리자 API는 최신 DB의 `ACTIVE + ADMIN + mfa_enrolled_at != null`을 요구한다.
- OTP 상태는 TOTP 등록 여부만 뜻한다. action-level TOTP 재인증과 MFA reset은 범위에서 제외한다.
- 자신의 disable/demote를 막고, active admin 제거 command는 하나의 transaction advisory lock 아래 남은 active admin을 확인해 항상 1명 이상을 보존한다.
- 동일값 변경은 `updated_at`과 audit를 변경하지 않는 성공 no-op이다.
- 상태·역할 변경과 audit insert는 같은 transaction에서 성공하거나 rollback한다.
- role을 LEARNER로 바꿔도 `mfa_enrolled_at`은 보존하며 UI는 learner를 `해당 없음`으로 표시한다.
- audit는 append-only다. token, cookie, TOTP code, private key와 원문 payload를 기록·반환하지 않는다.
- 테스트 설명은 한국어로 쓰며 새 E2E runner/spec을 만들지 않는다.
- Docker는 실제 PostgreSQL과 최종 smoke 때만 사용하고, 끝나면 즉시 내린다. 다른 프로젝트 volume은 보존한다.

## 공개 계약

```ts
type UserManagementListQuery = {
  query?: string;
  role?: 'LEARNER' | 'ADMIN';
  status?: 'ACTIVE' | 'DISABLED';
  mfaEnrolled?: boolean;
  page: number; // default 1
  pageSize: number; // default 20, max 100
};

type ManagedIdentityUserResponse = {
  id: string;
  email: string;
  role: 'LEARNER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  mfaEnrolled: boolean;
  mfaEnrolledAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

사용자 API:

- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:userId/status`
- `PATCH /api/v1/admin/users/:userId/role`
- 기존 `POST /api/v1/admin/users/invitations` 유지

감사 query는 `query`, `actorUserId`, `action`, `targetType`, `targetId`, `from`, `to`, `page`, `pageSize`를 지원한다. 정렬은 `(created_at DESC, id DESC)`다.

- `GET /api/v1/admin/audit-logs`
- `GET /api/v1/admin/audit-logs/:auditLogId`
- 관리자 홈은 목록의 `page=1&pageSize=5`를 재사용한다.

안전 오류:

- `SELF_LOCKOUT_FORBIDDEN` → 409
- `LAST_ACTIVE_ADMIN_REQUIRED` → 409
- `USER_NOT_FOUND`, `AUDIT_LOG_NOT_FOUND` → 404

## 파일 소유권

기능 브랜치 소유:

```text
shared/contracts/src/identity/user-management*
shared/contracts/src/operations/audit-logs*
backend/domain/src/identity/user-management*
backend/domain/src/identity/user.repository.ts
backend/domain/src/operations/*
backend/database/src/schema/identity.schema.ts
backend/database/src/queries/drizzle-user-management*
backend/database/src/queries/drizzle-audit-log*
backend/api/src/identity/admin-user-management.controller*
backend/api/src/identity/user-management.dto.ts
backend/api/src/operations/*
frontend/web/src/pages/user-management/*
frontend/web/src/pages/audit-log-management/*
frontend/web/src/app/routes/_authenticated.admin._enrolled.users.tsx
frontend/web/src/app/routes/_authenticated.admin._enrolled.audit-logs.tsx
```

통합 브랜치 전용이며 기능 브랜치에서 수정 금지:

```text
shared/contracts/src/index.ts
backend/domain/src/index.ts
backend/database/src/index.ts
backend/database/src/schema/index.ts
backend/api/src/app.module*
backend/api/src/openapi/**
backend/config/src/**
backend/database/drizzle/**
infra/src/application-stack.ts
infra/src/constructs/http-api.ts
frontend/web/src/app/routing/adminNavigation.ts
frontend/web/src/app/routes/__root.tsx
frontend/web/src/pages/admin-home/**
frontend/web/src/routeTree.gen.ts
package.json
**/package.json
pnpm-lock.yaml
```

기능 브랜치 test는 leaf module을 직접 import한다. package public import와 runtime 조립 검증은 통합 뒤 수행한다.

---

### Task 1: 사용자·감사 Zod 계약

**Files:**
- Modify: `shared/contracts/src/identity/user-management.ts`
- Modify: `shared/contracts/src/identity/user-management.spec.ts`
- Create: `shared/contracts/src/operations/audit-logs.ts`
- Create: `shared/contracts/src/operations/audit-logs.spec.ts`

- [ ] **RED:** 사용자 query의 trim/lowercase, enum, boolean `"true" | "false"`, page 기본값·상한, strict role body, `mfaEnrolledAt`, page metadata를 테스트한다.
- [ ] **RED:** 감사 actor를 `USER { userId, email } | SYSTEM { label }`로 고정하고 nullable target, ISO 기간과 `from <= to`, list/detail 차이를 테스트한다. list는 summary/requestId를 포함하지 않고 detail만 포함한다.
- [ ] Run:

```bash
pnpm exec vitest run \
  shared/contracts/src/identity/user-management.spec.ts \
  shared/contracts/src/operations/audit-logs.spec.ts
```

Expected: 새 schema가 없어 FAIL.

- [ ] **GREEN:** 최소 strict schema와 infer type을 구현한다. `query`는 최대 254자, pageSize는 1~100이다.
- [ ] 같은 명령을 다시 실행한다. Expected: PASS.

---

### Task 2: 사용자 변경 domain 정책

**Files:**
- Modify: `backend/domain/src/identity/user.repository.ts`
- Modify: `backend/domain/src/identity/user-management.ts`
- Modify: `backend/domain/src/identity/user-management.spec.ts`

명시적인 repository 결과를 사용한다.

```ts
type ManagedIdentityUserChangeResult =
  | { kind: 'UPDATED'; user: ManagedIdentityUser }
  | { kind: 'UNCHANGED'; user: ManagedIdentityUser }
  | { kind: 'NOT_FOUND' }
  | { kind: 'SELF_LOCKOUT' }
  | { kind: 'LAST_ACTIVE_ADMIN' };
```

- [ ] **RED:** ADMIN query 전달, role/status UPDATED·UNCHANGED, NOT_FOUND, SELF_LOCKOUT, LAST_ACTIVE_ADMIN와 기존 invitation 회귀를 테스트한다.
- [ ] Run:

```bash
pnpm exec vitest run backend/domain/src/identity/user-management.spec.ts
```

Expected: role command와 새 결과가 없어 FAIL.

- [ ] **GREEN:** service는 ADMIN 확인과 repository 결과→stable error 변환만 담당한다. 동시성 판단을 stale pre-read로 구현하지 않는다.
- [ ] 같은 명령을 다시 실행한다. Expected: PASS.

---

### Task 3: 사용자 검색·원자 command Drizzle adapter

**Files:**
- Modify: `backend/database/src/queries/drizzle-user-management.query.ts`
- Modify: `backend/database/src/queries/drizzle-user-management.query.spec.ts`
- Create: `backend/database/src/queries/drizzle-user-management.query.integration.spec.ts`
- Modify: `backend/database/src/schema/identity.schema.ts`
- Modify: `backend/database/src/schema/schema.spec.ts`

- [ ] **RED:** email `ILIKE`, role/status/MFA filter, count, offset, `(updated_at DESC, id DESC)` stable page를 테스트한다.
- [ ] **RED:** status/role transaction의 순서를 테스트한다.

```text
BEGIN
pg_advisory_xact_lock(고정 identity admin mutation key)
target 조회
동일값이면 UNCHANGED
자기 disable/demote면 SELF_LOCKOUT
ACTIVE ADMIN을 제거한다면 남은 ACTIVE ADMIN count 확인
0명이 되면 LAST_ACTIVE_ADMIN
조건부 user update
before/after audit insert
COMMIT
```

모든 role/status command가 같은 advisory key를 사용해야 한다. audit action은 상태의 기존 두 action과 신규 `IDENTITY_USER_ROLE_CHANGED`를 사용한다.

- [ ] Run:

```bash
pnpm exec vitest run \
  backend/database/src/queries/drizzle-user-management.query.spec.ts \
  backend/database/src/schema/schema.spec.ts
```

Expected: 검색, role command, index가 없어 FAIL.

- [ ] **GREEN:** 최소 Drizzle 구현과 다음 schema index를 추가한다.

```text
users_updated_at_id_idx(updated_at, id)
audit_logs_created_at_id_idx(created_at, id)
audit_logs_actor_created_at_id_idx(actor_user_id, created_at, id)
audit_logs_action_created_at_id_idx(action, created_at, id)
audit_logs_target_created_at_id_idx(target_type, target_id, created_at, id)
```

- [ ] 단위 test를 다시 실행한다. Expected: PASS.
- [ ] **PG RED/GREEN:** 서로 다른 두 active admin을 동시에 disable/demote하는 Promise를 실행해 하나만 성공하고 최소 한 명이 남는지, 동일값은 `updated_at`·audit count 불변인지, audit 실패는 user update도 rollback하는지 실제 PostgreSQL에서 검증한다.

```bash
USER_AUDIT_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/flex_thia \
  pnpm exec vitest run \
  backend/database/src/queries/drizzle-user-management.query.integration.spec.ts
```

Expected: PASS.

---

### Task 4: Operations 감사 read query

**Files:**
- Create: `backend/domain/src/operations/audit-log.ts`
- Create: `backend/domain/src/operations/audit-log.service.ts`
- Create: `backend/domain/src/operations/audit-log.service.spec.ts`
- Create: `backend/database/src/queries/drizzle-audit-log.query.ts`
- Create: `backend/database/src/queries/drizzle-audit-log.query.spec.ts`
- Create: `backend/database/src/queries/drizzle-audit-log.query.integration.spec.ts`

- [ ] **RED:** service list 위임과 없는 상세의 `AUDIT_LOG_NOT_FOUND`를 테스트한다. write method가 없는 port로 정의한다.
- [ ] **RED:** `audit_logs LEFT JOIN users`, actor email/action/target OR 검색, 나머지 filter AND 결합, 기간, count, stable page, USER/SYSTEM actor, nullable legacy target를 테스트한다.
- [ ] Run:

```bash
pnpm exec vitest run \
  backend/domain/src/operations/audit-log.service.spec.ts \
  backend/database/src/queries/drizzle-audit-log.query.spec.ts
```

Expected: 파일이 없어 FAIL.

- [ ] **GREEN:** list projection에서 summary/requestId를 제외하고 detail에서만 선택하는 최소 query를 구현한다.
- [ ] 같은 명령을 다시 실행한다. Expected: PASS.
- [ ] **PG:** user/system actor, nullable target, 조합 filter, 같은 createdAt의 ID tie-break, 조회 전후 audit count 불변을 검증한다.

```bash
USER_AUDIT_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/flex_thia \
  pnpm exec vitest run \
  backend/database/src/queries/drizzle-audit-log.query.integration.spec.ts
```

Expected: PASS.

---

### Task 5: ADMIN API

**Files:**
- Create: `backend/api/src/identity/user-management.dto.ts`
- Modify: `backend/api/src/identity/admin-user-management.controller.ts`
- Modify: `backend/api/src/identity/admin-user-management.controller.spec.ts`
- Create: `backend/api/src/operations/audit-log.dto.ts`
- Create: `backend/api/src/operations/admin-audit-logs.controller.ts`
- Create: `backend/api/src/operations/admin-audit-logs.controller.spec.ts`
- Create: `backend/api/src/operations/operations.module.ts`
- Create: `backend/api/src/operations/operations.module.spec.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.spec.ts`

- [ ] **RED:** user list query parse, role PATCH, `mfaEnrolledAt`·page 직렬화, actor/request ID 전달을 테스트한다.
- [ ] **RED:** audit list/detail의 Cognito→role→MFA guards, query/path parse, list/detail projection과 404를 테스트한다.
- [ ] **RED:** SELF_LOCKOUT/LAST_ACTIVE_ADMIN 409, 두 NOT_FOUND 404 mapping을 테스트한다.
- [ ] Run:

```bash
pnpm exec vitest run \
  backend/api/src/identity/admin-user-management.controller.spec.ts \
  backend/api/src/operations/admin-audit-logs.controller.spec.ts \
  backend/api/src/operations/operations.module.spec.ts \
  backend/api/src/common/errors/domain-exception.filter.spec.ts
```

Expected: 새 endpoint/module/error가 없어 FAIL.

- [ ] **GREEN:** Controller는 Zod parse·mapping만, service/repository는 각각 규칙·SQL만 담당하도록 최소 구현한다. Swagger DTO는 module-local `createZodDto`로 둔다.
- [ ] 같은 명령을 다시 실행한다. Expected: PASS.

---

### Task 6: 사용자 관리 UI

**Files:**
- Create: `frontend/web/src/pages/user-management/model/userManagementSearch.ts`
- Create: `frontend/web/src/pages/user-management/api/userManagementQueries.ts`
- Modify: `frontend/web/src/pages/user-management/ui/UserManagementPage.tsx`
- Modify: `frontend/web/src/pages/user-management/ui/UserManagementPage.test.tsx`
- Modify: `frontend/web/src/app/routes/_authenticated.admin._enrolled.users.tsx`

- [ ] **RED:** URL 소유 email/role/status/MFA/page, filter 변경 시 page 1, loading/error/retry, 전체 empty/filter empty, pagination을 테스트한다.
- [ ] **RED:** ADMIN 등록·미등록과 LEARNER 해당 없음, status/role mutation, 성공 invalidation, 409 오류를 테스트한다.
- [ ] 현재 session user row의 disable/demote 버튼은 disabled로 테스트하되 서버 409가 최종 방어선이다.
- [ ] Run:

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/user-management
```

Expected: 검색·role·OTP UI가 없어 FAIL.

- [ ] **GREEN:** 기존 beta invitation을 보존하고, raw control 대신 기존 shadcn/shared UI를 조합한다.
- [ ] 같은 명령을 다시 실행한다. Expected: PASS.

---

### Task 7: 감사 목록·상세 UI

**Files:**
- Create: `frontend/web/src/pages/audit-log-management/model/auditLogSearch.ts`
- Create: `frontend/web/src/pages/audit-log-management/api/auditLogQueries.ts`
- Create: `frontend/web/src/pages/audit-log-management/ui/AuditLogManagementPage.tsx`
- Create: `frontend/web/src/pages/audit-log-management/ui/AuditLogManagementPage.test.tsx`
- Create: `frontend/web/src/pages/audit-log-management/index.ts`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.audit-logs.tsx`

- [ ] **RED:** URL filter와 selected audit ID, loading/error/retry, empty/filter empty, pagination, USER/SYSTEM actor와 legacy null target을 테스트한다.
- [ ] **RED:** row 선택 시 detail query, summary/requestId 표시, detail 404에서도 목록 유지, 모바일 label-value fallback을 테스트한다.
- [ ] Run:

```bash
pnpm --filter @flex-thia/web exec vitest run src/pages/audit-log-management
```

Expected: 파일이 없어 FAIL.

- [ ] **GREEN:** summary는 escaped top-level key/value로 표시하고 HTML 삽입이나 전체 payload 추론을 하지 않는다.
- [ ] 같은 명령을 다시 실행한다. Expected: PASS.

---

### Task 8: 기능 브랜치 검증

- [ ] leaf focused test를 한 번에 실행한다.

```bash
pnpm exec vitest run \
  shared/contracts/src/identity/user-management.spec.ts \
  shared/contracts/src/operations/audit-logs.spec.ts \
  backend/domain/src/identity/user-management.spec.ts \
  backend/domain/src/operations/audit-log.service.spec.ts \
  backend/database/src/queries/drizzle-user-management.query.spec.ts \
  backend/database/src/queries/drizzle-audit-log.query.spec.ts \
  backend/api/src/identity/admin-user-management.controller.spec.ts \
  backend/api/src/operations/admin-audit-logs.controller.spec.ts

pnpm --filter @flex-thia/web exec vitest run \
  src/pages/user-management \
  src/pages/audit-log-management
```

Expected: PASS.

- [ ] `pnpm format:check`, `pnpm lint`와 변경 workspace typecheck를 실행한다. public export 부재로 실패하는 root import 검증은 통합 Task 9에서 수행한다.
- [ ] `git diff --check`와 금지 공유 파일 미변경을 확인한다.
- [ ] `dist`, `.vite`, `coverage`만 정리하고 `node_modules`, pnpm store, PostgreSQL volume은 재사용한다.
- [ ] PostgreSQL 검증이 끝났으면 이번 compose project container를 내린다.

---

### Task 9: 통합 브랜치 직렬 조립

**Files:**
- Modify: `shared/contracts/src/index.ts`
- Modify: `backend/domain/src/index.ts`
- Modify: `backend/database/src/index.ts`
- Modify: `backend/database/src/schema/index.ts`
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/app.module.spec.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Modify: `infra/src/constructs/http-api.ts`
- Modify: `infra/test/http-api.spec.ts`
- Modify: `frontend/web/src/app/routing/adminNavigation.ts`
- Modify: `frontend/web/src/app/routes/__root.tsx`
- Modify: `frontend/web/src/pages/admin-home/*`
- Generate: `backend/database/drizzle/<wave4 migration>`
- Generate: `frontend/web/src/routeTree.gen.ts`

- [ ] root export, `DrizzleAuditLogQuery`/`AuditLogService`/`OperationsModule`, existing user management service를 AppModule에 연결한다.
- [ ] `db:generate`로 한 개의 Wave 4 migration을 만들고 기존 table/column/data drop 없이 Task 3 index가 생성되는지 확인한다.
- [ ] 빈 DB와 Wave 3 DB upgrade에서 user/audit sentinel 보존과 index 존재를 확인한 뒤 재생성 결과가 “No schema changes”인지 확인한다.
- [ ] OpenAPI와 API Gateway에 user role 1개, audit 2개 exact route와 400/401/403/404/409/500 metadata를 추가한다.
- [ ] 관리자 navigation/title에 `/admin/audit-logs` `감사 기록`을 추가하고 route tree는 generator로만 갱신한다.
- [ ] 관리자 홈에 독립 audit query `page=1&pageSize=5`를 추가한다. 실패해도 기존 문제·어휘 영역을 유지하는 component test를 작성한다.
- [ ] focused integration test를 실행한다.

```bash
pnpm exec vitest run \
  backend/api/src/app.module.spec.ts \
  backend/api/src/openapi/openapi.spec.ts \
  infra/test/http-api.spec.ts

pnpm --filter @flex-thia/web exec vitest run \
  src/app/routing/roleNavigation.test.tsx \
  src/app/routes/-__root.test.tsx \
  src/pages/admin-home \
  src/pages/user-management \
  src/pages/audit-log-management
```

Expected: PASS.

---

### Task 10: 최종 PG·전체 gate·로컬 smoke·정리

- [ ] Docker PostgreSQL을 한 번 올려 user command와 audit integration spec을 순서대로 실행한다.

```bash
USER_AUDIT_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/flex_thia \
  pnpm exec vitest run \
  backend/database/src/queries/drizzle-user-management.query.integration.spec.ts \
  backend/database/src/queries/drizzle-audit-log.query.integration.spec.ts
```

Expected: PASS, 특히 동시 교차 disable/demote 후 ACTIVE ADMIN이 1명 이상이다.

- [ ] 전체 gate를 실행한다.

```bash
CHOKIDAR_USEPOLLING=1 pnpm check
```

Expected: structure, format, architecture, lint, typecheck, test, coverage, build가 모두 PASS.

- [ ] E2E 파일 없이 local admin `admin@hufs.ac.kr`, code/TOTP `123456`으로 수동 smoke한다.
  1. user 검색/filter/page와 OTP 상태
  2. 다른 learner의 role/status 변경
  3. 동일값 no-op audit 불변
  4. 자기 disable/demote 409
  5. 마지막 ACTIVE ADMIN 제거 409
  6. audit 목록/filter/detail
  7. 홈 최근 변경과 browser console 무오류
- [ ] smoke용 사용자 값은 API로 복구하고 복구 audit는 보존한다. audit row를 삭제하지 않는다.
- [ ] web/API와 이번 Docker compose project를 종료한다.
- [ ] 다른 프로젝트 volume을 보존한 채 project `dist`, `.vite`, `coverage`, `cdk.out`과 불필요 build cache를 정리한다.
- [ ] 통합 완료 worktree와 그 `node_modules`를 제거하고 `docker ps`, `docker system df`, `df -h`, `git status --short`, `git diff --check`를 확인한다.

## 완료 기준

- 사용자 검색·role/status/TOTP filter·page와 상태·역할 변경이 동작한다.
- 자기 잠금, 동일값 no-op, advisory lock 기반 마지막 ACTIVE ADMIN 보존이 실제 PostgreSQL에서 증명된다.
- 변경과 before/after audit가 한 transaction이며 실패 시 함께 rollback한다.
- 감사 목록·상세와 관리자 홈 최근 5건이 legacy system/null target을 포함해 동작한다.
- TOTP 등록 상태만 표시하고 action-level 재인증은 구현하지 않는다.
- OpenAPI/API Gateway/navigation/migration/route tree가 통합 브랜치에서 한 번만 조립된다.
- 실제 PG test, `pnpm check`, 수동 local smoke가 통과하고 Docker와 재생성 가능한 부산물이 정리된다.
