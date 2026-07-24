# Repository Folder Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백엔드·프론트엔드·공유 코드를 최상위 제품 영역으로 재배치하고 자동 검사와 단일 convention 문서로 구조 이탈을 방지한다.

**Architecture:** 실행 및 백엔드 지원 workspace는 `backend/*`, 프론트엔드는 `frontend/*`, 양쪽의 공개 계약은 `shared/contracts`에 둔다. package 이름과 `@flex-thia/*` import는 유지하고 pnpm·TypeScript·Vitest·ESLint·CDK의 물리 경로만 갱신한다. `conventions/structure-convention.md`를 규칙의 단일 원본으로 두고 root 검사 스크립트가 과거 최상위 폴더의 재생성을 거부한다.

**Tech Stack:** pnpm workspace, TypeScript, Vitest, ESLint, Prettier, NestJS, AWS CDK

## Global Constraints

- 새 브랜치, worktree, PR을 만들지 않는다.
- 최상위 구조는 `backend/*`, `frontend/*`, `shared/*`, `infra`, `docs`, `conventions`를 사용한다.
- `frontend/web`은 실제 프론트엔드 구현 전까지 빈 scaffold를 만들지 않는다.
- package 이름과 `@flex-thia/*` 공개 import는 바꾸지 않는다.
- `AGENTS.md`와 `CLAUDE.md`에는 구조 규칙을 복제하지 않고 `conventions/structure-convention.md`만 참조한다.
- 사용자가 승인한 기존 미추적 설계·계획 문서는 경로 갱신 뒤 작업 커밋에 포함한다.
- `.agents/skills/claude-review/agents/openai.yaml`은 수정하거나 stage하지 않는다.
- 기존 기능 코드, DB schema, migration SQL, API 계약의 의미를 변경하지 않는다.

---

### Task 1: 구조 이탈 자동 검사 추가

**Files:**

- Create: `scripts/check-project-structure.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: root command `pnpm structure:check`
- Enforces:
  - `apps`, `packages` 최상위 폴더 금지
  - 승인된 backend/shared workspace `package.json` 존재
  - canonical structure convention 존재

- [x] **Step 1: 구조 검사 스크립트를 작성한다**

```js
/** 저장소 최상위 workspace가 승인된 제품 영역에만 존재하는지 검사한다 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const forbiddenDirectories = ['apps', 'packages'];
const requiredFiles = [
  'backend/api/package.json',
  'backend/worker/package.json',
  'backend/domain/package.json',
  'backend/database/package.json',
  'backend/providers/package.json',
  'backend/config/package.json',
  'shared/contracts/package.json',
  'conventions/structure-convention.md',
];

const violations = [
  ...forbiddenDirectories
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => `금지된 과거 최상위 폴더가 존재합니다: ${path}`),
  ...requiredFiles
    .filter((path) => !existsSync(resolve(root, path)))
    .map((path) => `필수 구조 파일을 찾을 수 없습니다: ${path}`),
];

if (violations.length > 0) {
  throw new Error(violations.join('\n'));
}
```

- [x] **Step 2: root 명령에 구조 검사를 연결한다**

`package.json`에 다음 script를 추가하고 `check`의 첫 단계로 실행한다.

```json
{
  "scripts": {
    "structure:check": "node scripts/check-project-structure.mjs",
    "check": "pnpm structure:check && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

- [x] **Step 3: 현재 과거 구조 때문에 검사가 실패하는지 확인한다**

Run:

```bash
pnpm structure:check
```

Expected: FAIL하며 `apps`, `packages`, 새 필수 workspace 부재를 보고한다.

---

### Task 2: workspace를 제품 영역으로 이동

**Files:**

- Move: `apps/api` → `backend/api`
- Move: `apps/worker` → `backend/worker`
- Move: `packages/domain` → `backend/domain`
- Move: `packages/database` → `backend/database`
- Move: `packages/providers` → `backend/providers`
- Move: `packages/config` → `backend/config`
- Move: `packages/contracts` → `shared/contracts`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.base.json`
- Modify: `vitest.config.ts`
- Modify: `eslint.config.mjs`
- Modify: `infra/src/application-stack.ts`

**Interfaces:**

- Preserves: `@flex-thia/api`, `@flex-thia/worker`, `@flex-thia/domain`, `@flex-thia/database`, `@flex-thia/providers`, `@flex-thia/config`, `@flex-thia/contracts`
- Produces: pnpm workspace roots `backend/*`, `frontend/*`, `shared/*`, `infra`

- [x] **Step 1: 이동 대상과 목적지 충돌을 확인한다**

Run:

```bash
find backend frontend -mindepth 1 -maxdepth 1 -print
git status --short
```

Expected: `backend`와 `frontend` 아래 이동 충돌 대상이 없고, 기존 사용자 문서 변경만 표시된다.

- [x] **Step 2: Git rename으로 workspace를 이동한다**

Run:

```bash
git mv apps/api backend/api
git mv apps/worker backend/worker
git mv packages/domain backend/domain
git mv packages/database backend/database
git mv packages/providers backend/providers
git mv packages/config backend/config
mkdir -p shared
git mv packages/contracts shared/contracts
```

Expected: Git이 모든 기존 파일을 rename으로 추적하고 `apps`, `packages`가 남지 않는다.

- [x] **Step 3: pnpm workspace와 TypeScript alias를 갱신한다**

`pnpm-workspace.yaml`:

```yaml
packages:
  - backend/*
  - frontend/*
  - shared/*
  - infra
```

`tsconfig.base.json`의 `paths`:

```json
{
  "@flex-thia/config": ["./backend/config/src/index.ts"],
  "@flex-thia/contracts": ["./shared/contracts/src/index.ts"],
  "@flex-thia/database": ["./backend/database/src/index.ts"],
  "@flex-thia/domain": ["./backend/domain/src/index.ts"],
  "@flex-thia/providers": ["./backend/providers/src/index.ts"],
  "@flex-thia/providers/fakes": [
    "./backend/providers/src/fakes/index.ts"
  ],
  "@flex-thia/providers/*": ["./backend/providers/src/*"]
}
```

- [x] **Step 4: 테스트·lint·CDK의 명시적 경로를 갱신한다**

`vitest.config.ts`:

```ts
include: [
  'backend/**/src/**/*.spec.ts',
  'frontend/**/src/**/*.spec.ts',
  'shared/**/src/**/*.spec.ts',
  'infra/test/**/*.spec.ts',
],
```

`eslint.config.mjs`:

```js
'backend/database/drizzle/**',
```

`infra/src/application-stack.ts`:

```ts
new URL('../../backend/worker/src/', import.meta.url);
new URL('../../backend/api/dist/', import.meta.url);
```

- [x] **Step 5: lockfile importer를 새 workspace 경로로 다시 계산한다**

Run:

```bash
pnpm install --lockfile-only --offline
```

Expected: `pnpm-lock.yaml` importer가 `backend/*`, `shared/contracts`를 사용하고 dependency version은 바뀌지 않는다.

- [x] **Step 6: 새 구조와 workspace 인식을 확인한다**

Run:

```bash
pnpm structure:check
pnpm list -r --depth -1
```

Expected: 구조 검사가 exit 0이고 8개 하위 workspace가 기존 package 이름으로 표시된다.

- [x] **Step 7: 경로 기반 정적 검사를 통과시킨다**

Run:

```bash
pnpm typecheck
pnpm exec vitest run backend shared infra/test
```

Expected: typecheck와 기존 단위 테스트가 exit 0이다.

---

### Task 3: 구조 규칙의 단일 원본과 모든 문서 경로 갱신

**Files:**

- Modify: `conventions/structure-convention.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/development/project-structure.md`
- Modify: `docs/development/backend-foundation.md`
- Add and Modify: `docs/development/backend-architecture.md`
- Modify: `docs/development/**/*.md`
- Modify: `docs/superpowers/**/*.md`
- Modify: `docs/troubleshooting/**/*.md`
- Add and Modify: `docs/superpowers/plans/2026-07-23-backend-mvp-roadmap.md`
- Add and Modify: `docs/superpowers/plans/2026-07-23-identity-auth-mvp.md`
- Add and Modify: `docs/superpowers/specs/2026-07-23-backend-mvp-domain-erd-api-design.md`

**Interfaces:**

- Produces: canonical structure policy at `conventions/structure-convention.md`
- References: `AGENTS.md`, `CLAUDE.md`, and explanatory docs point to the canonical policy

- [x] **Step 1: canonical convention을 새 최상위 구조로 교체한다**

`conventions/structure-convention.md`는 다음 규칙을 명시한다.

```text
backend/
├── api/
├── worker/
├── domain/
├── database/
├── providers/
└── config/
frontend/
shared/
└── contracts/
```

코드 배치표는 다음 경로만 사용한다.

| 책임 | 위치 |
| --- | --- |
| HTTP 전달 | `backend/api` |
| 비동기 진입점 | `backend/worker` |
| 업무 규칙·port | `backend/domain` |
| DB 구현 | `backend/database` |
| 외부 adapter | `backend/providers` |
| 환경 설정 | `backend/config` |
| 공개 API 계약 | `shared/contracts` |
| Vite React 앱 | `frontend/web` |

과거 `apps/*`, `packages/*`는 금지하며 구조 변경이 필요하면 이 convention을 먼저 갱신하도록 적는다.

- [x] **Step 2: AGENTS와 CLAUDE는 canonical convention만 참조하게 한다**

`AGENTS.md`의 프론트엔드·백엔드 경로 목록과 중복 배치 규칙을 제거하고 다음 참조를 둔다.

```md
코드 위치와 의존성 방향은 `conventions/structure-convention.md`를 단일
기준으로 따른다. 백엔드 기능 모듈의 세부 책임은
`docs/development/backend-architecture.md`를 함께 따른다.
```

`CLAUDE.md`는 `@conventions/structure-convention.md` 참조를 유지하며 별도 경로 규칙을 추가하지 않는다.

- [x] **Step 3: 현재 구조 설명과 백엔드 아키텍처를 새 경로로 갱신한다**

`docs/development/project-structure.md`는 `backend`, `frontend`, `shared`를 최상위로 설명하고 convention이 규칙의 단일 원본임을 명시한다.

`docs/development/backend-architecture.md`의 workspace 책임은 다음 새 경로를 사용한다.

```text
backend/api
backend/worker
backend/domain
backend/database
backend/providers
backend/config
shared/contracts
```

- [x] **Step 4: 나머지 문서의 물리 경로와 Markdown 링크를 갱신한다**

다음 대응을 모든 `docs/**/*.md`에 적용하되 역사적 의사결정 내용은 바꾸지 않는다.

```text
apps/api          -> backend/api
apps/worker       -> backend/worker
packages/domain   -> backend/domain
packages/database -> backend/database
packages/providers -> backend/providers
packages/config   -> backend/config
packages/contracts -> shared/contracts
apps/web          -> frontend/web
```

상대 Markdown 링크도 같은 대상 파일을 가리키도록 수정한다.

- [x] **Step 5: 문서와 설정의 과거 활성 경로를 검사한다**

Run:

```bash
rg -n "apps/api|apps/worker|apps/web|packages/(domain|database|providers|config|contracts)" AGENTS.md CLAUDE.md conventions docs .github infra package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts eslint.config.mjs
```

Expected: 재구성 설계·계획에서 기존→신규 대응을 설명하는 행 외에는 과거 활성 경로가 없다.

- [x] **Step 6: 문서 포맷과 링크 대상 존재를 확인한다**

Run:

```bash
pnpm exec prettier --check AGENTS.md CLAUDE.md conventions docs
```

Expected: 모든 포함 문서가 Prettier 검사를 통과한다.

---

### Task 4: 전체 검증과 구조 변경 커밋

**Files:**

- Verify: 전체 변경 파일
- Commit: 구조 이동·설정·문서·승인된 기존 문서만

**Interfaces:**

- Consumes: Tasks 1–3의 최종 workspace와 canonical convention
- Produces: 새 경로에서 검증된 저장소와 구조 변경 커밋

- [x] **Step 1: 구조·lint·typecheck를 새 위치에서 검증한다**

Run:

```bash
pnpm structure:check
pnpm lint
pnpm typecheck
```

Expected: 모두 exit 0이다.

- [x] **Step 2: Lambda·단위 테스트·workspace build를 검증한다**

Run:

```bash
pnpm test
pnpm build
```

Expected:

- API·worker Lambda bundle 성공
- 모든 Vitest 단위 테스트 성공
- 모든 workspace TypeScript build 성공

- [x] **Step 3: 전체 format check의 기존 blocker를 분리한다**

Run:

```bash
pnpm format:check
```

Expected: 구조 변경 파일은 모두 통과하며, 실패한다면 기존 `.agents/skills/claude-review/agents/openai.yaml` 한 파일만 보고된다.

- [x] **Step 4: 최종 diff 범위를 확인한다**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected:

- `apps`, `packages`의 파일이 새 경로 rename으로 추적된다.
- 승인된 문서 외의 `.agents/**` 변경은 없다.
- 기능 코드와 migration 내용 변경은 없다.
- whitespace 오류가 없다.

- [x] **Step 5: 구조 변경만 stage하고 커밋한다**

```bash
git add .prettierignore AGENTS.md backend shared infra/src/application-stack.ts conventions docs package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts eslint.config.mjs scripts
git commit -m "refactor: organize repository by product area"
```

- [x] **Step 6: 커밋 뒤 작업 트리를 확인한다**

Run:

```bash
git status --short
git show --stat --oneline HEAD
```

Expected: 이번 작업에 포함하기로 한 파일은 모두 커밋되고 `.agents/**`는 변경되지 않는다.
