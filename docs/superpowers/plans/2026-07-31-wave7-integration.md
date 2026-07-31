# Wave 7 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세 Wave 7 branch를 검토·통합하고 generated artifacts, PostgreSQL,
전체 quality gate와 실제 관리자·학습자 local 흐름을 검증한 clean `main`을
준비한다.

**Architecture:** 모든 leaf는 계획 문서 commit을 포함한 동일 local main에서
worktree로 시작한다. Leaf별 review가 통과한 뒤 local→product→delivery
순서로 integration branch에 merge하고 migration·route tree·공용 문서를
한 번만 생성·정리한다.

**Tech Stack:** Git worktrees, pnpm, Vitest, Drizzle PostgreSQL, Docker
Compose, Vite, NestJS, AWS CDK

## Global Constraints

- 세 leaf 계획과 `2026-07-31-wave7-full-product-hardening-design.md`를 단일 원본으로 사용한다.
- push와 PR을 만들지 않는다.
- 모든 leaf는 동일한 local main SHA에서 시작한다.
- 외부 유료 provider와 실제 AWS deploy를 실행하지 않는다.
- E2E test file/runner를 추가하지 않는다.
- 다른 project container와 volume을 중지·변경하지 않는다.
- FLEX THIA 종료는 `down -v` 없이 수행한다.
- migration, `routeTree.gen.ts`, 공용 문서 충돌은 integration에서만 해결한다.
- 각 leaf report와 review evidence를 `.superpowers/sdd/<plan>/` ledger에 기록한다.
- completion claim 전 fresh `pnpm check`, synth, Docker/manual evidence를 확인한다.
- 검증 후 정확한 FLEX THIA `dist`, `coverage`, `.vite`, `cdk.out`만 제거한다.

---

### Task 1: 동일 기준의 세 isolated worktree

**Files:**

- Worktree: `.worktrees/wave7-local-runtime`
- Worktree: `.worktrees/wave7-product-completion`
- Worktree: `.worktrees/wave7-delivery-hardening`
- Branches:
  - `codex/wave7-local-runtime`
  - `codex/wave7-product-completion`
  - `codex/wave7-delivery-hardening`

**Interfaces:**

- Consumes: clean local `main`
- Produces: 같은 base SHA의 세 isolated worktree

- [ ] **Step 1: isolation과 ignore 확인**

Run:

```bash
git status --short
git check-ignore -q .worktrees
git rev-parse --git-dir
git rev-parse --git-common-dir
git branch --show-current
git rev-parse HEAD
```

Expected: clean main, `.worktrees` ignored, base SHA 하나.

- [ ] **Step 2: 세 worktree 생성**

Run:

```bash
git worktree add .worktrees/wave7-local-runtime -b codex/wave7-local-runtime main
git worktree add .worktrees/wave7-product-completion -b codex/wave7-product-completion main
git worktree add .worktrees/wave7-delivery-hardening -b codex/wave7-delivery-hardening main
```

- [ ] **Step 3: frozen workspace 준비**

각 worktree에서 `CI=true pnpm install --frozen-lockfile`을 실행하되 lockfile을
변경하지 않는다. dependency download가 필요하지 않으면 existing store를
재사용한다.

- [ ] **Step 4: clean baseline**

각 worktree에서 plan owner의 focused existing tests와 typecheck를 실행한다.
실패하면 구현을 시작하지 않고 main에서도 같은 실패를 재현해 baseline
문제인지 확인한다.

### Task 2: Leaf 구현과 task별 review

**Files:**

- Plan: `docs/superpowers/plans/2026-07-31-wave7-local-runtime.md`
- Plan: `docs/superpowers/plans/2026-07-31-wave7-product-completion.md`
- Plan: `docs/superpowers/plans/2026-07-31-wave7-delivery-hardening.md`

**Interfaces:**

- Consumes: Task 1 worktrees
- Produces: review-clean leaf branch commits와 report ledger

- [ ] **Step 1: 각 plan workspace/ledger 생성**

각 plan마다 `superpowers:subagent-driven-development`의
`scripts/sdd-workspace`를 사용하고 첫 줄에 exact plan path를 기록한다.

- [ ] **Step 2: task별 TDD 구현**

각 task는 RED command/output, implementation, GREEN command/output,
commit과 self-review를 report에 남긴다. 구현자가 자기 소유 경계 밖
변경이 필요하면 중복 수정하지 않고 integration ledger에 기록한다.

- [ ] **Step 3: task review와 fix loop**

task brief/report/review package로 spec compliance와 code quality를
검토한다. Critical/Important는 원 구현자 fix와 scoped re-review를
통과하기 전 다음 task로 넘기지 않는다.

- [ ] **Step 4: leaf final review**

각 branch 전체 diff를 가장 강한 reviewer로 검토하고 open
Critical/Important 0을 확인한다. leaf focused verification을 fresh
실행하고 exact 결과를 ledger에 남긴다.

### Task 3: 순차 merge와 generated artifacts

**Files:**

- Generated: `backend/database/drizzle/**`
- Generated: `frontend/web/src/routeTree.gen.ts`
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Modify: `backend/api/src/content-production/content-production.module.ts`
- Modify: `backend/database/src/index.ts`
- Modify: `backend/domain/src/content-production/index.ts`
- Modify: `backend/providers/src/index.ts`
- Modify: `shared/contracts/src/index.ts`
- Modify: `frontend/web/src/app/routing/adminNavigation.ts`
- Modify: `frontend/web/src/app/routing/routeReachability.test.ts`

**Interfaces:**

- Consumes: review-clean leaf branches
- Produces: `codex/wave7-integration`

- [ ] **Step 1: integration branch 생성**

clean main에서 `codex/wave7-integration`을 만들고 local runtime,
product completion, delivery hardening 순서로 `--no-ff` merge한다.

- [ ] **Step 2: hotspot conflict 해결**

`app.module.ts`는 local provider/processor 조립과 product candidate
review service를 모두 보존한다. package barrels는 세 branch의 public
export를 합집합으로 유지한다. delivery의 route test rename과 product
route files를 함께 보존한다.

- [ ] **Step 3: migration 생성**

isolated PostgreSQL을 host 55432로 실행하고 product schema source에서
정확히 한 migration을 생성한다.

```bash
pnpm --filter @flex-thia/database db:generate
```

snapshot/journal/SQL을 검토해 candidate lifecycle column/index/audit
변경만 포함하며 destructive drop/recreate가 없는지 확인한다.

- [ ] **Step 4: route tree 생성**

Run:

```bash
pnpm --filter @flex-thia/web build
```

Expected: product routes 포함, ignored test route 미포함, 500KB warning 없음.
생성 tree 외 unrelated build artifact는 commit하지 않는다.

- [ ] **Step 5: 통합 문서 정합성**

README와 AWS deployment guide의 URL, scripts, provider limitation과
production artifact 설명이 서로 모순되지 않는지 확인한다. legacy
password login 설명은 현재 문서 진입점에서 제거한다.

- [ ] **Step 6: integration commit**

generated migration, route tree, conflict resolution과 문서 정합성을
한 integration commit으로 기록한다.

### Task 4: Full static/unit/infrastructure verification

**Files:**

- Evidence only; production source를 추가 수정하지 않음

**Interfaces:**

- Consumes: Task 3 integration HEAD
- Produces: fresh whole-repository evidence

- [ ] **Step 1: full quality gate**

Run:

```bash
CHOKIDAR_USEPOLLING=1 pnpm check
```

Expected: structure, format, architecture, lint, typecheck, all unit/component
tests, coverage와 workspace builds PASS.

- [ ] **Step 2: infrastructure verification**

Run:

```bash
pnpm infra:test
pnpm infra:synth
VITE_API_BASE_URL=https://api.example.com/api/v1 pnpm --filter @flex-thia/web build
node scripts/verify-production-web-artifact.mjs frontend/web/dist https://api.example.com/api/v1
```

Expected: fixture synth PASS, production artifact verifier PASS, AWS call 없음.

- [ ] **Step 3: actual PostgreSQL verification**

FLEX THIA project의 PostgreSQL만 55432에서 시작해 empty DB migration과
existing seeded DB migration을 각각 검증한다. schema reset은 FLEX THIA
database 안에서만 수행하고 다른 project DB를 사용하지 않는다.

- [ ] **Step 4: whole-branch code review**

설계/세 계획/merge base/HEAD diff package로 최종 review를 수행한다.
Critical/Important finding은 한 fix wave와 scoped re-review로 닫는다.

### Task 5: Actual local admin·learner manual verification

**Files:**

- Runtime evidence only

**Interfaces:**

- Consumes: README의 `local:fresh`, `local:preserve`, `local:stop`
- Produces: browser/curl manual evidence와 preserved FLEX THIA volume

- [ ] **Step 1: collision precondition 확인**

host 3000·5432를 사용하는 기존 project container가 running인 것을
read-only 확인한다. 그 container를 중지하지 않는다.

- [ ] **Step 2: FLEX THIA fresh start**

README command로 `flex-thia-local` project를 시작한다. PostgreSQL 55432,
API 53000, web 5173 health를 확인한다.

- [ ] **Step 3: authentication/portal 확인**

브라우저에서 다음을 확인한다.

```text
learner@hufs.ac.kr → 123456 → /learn
admin@hufs.ac.kr → 123456 → TOTP 123456 → /admin
ADMIN 관리↔학습 portal switch
```

- [ ] **Step 4: learner media 흐름**

어휘 목록 filter/pagination/detail, 문제 상세·제출, 개념 상세, 연습
진입과 seed audio HTTP 200/playback을 확인한다.

- [ ] **Step 5: admin production 흐름**

content input upload, deterministic vocabulary/question candidate 생성,
어휘 candidate DRAFT 승인 또는 existing link, question candidate 승인,
실제 preview/version diff, TTS regenerate/job 완료/audio playback,
readiness와 publish를 확인한다.

- [ ] **Step 6: preserve restart**

FLEX THIA만 stop 후 preserve start하고 Task 5에서 만든 candidate/draft/job이
남아 있는지 확인한다.

- [ ] **Step 7: safe shutdown**

`local:stop`으로 FLEX THIA container만 종료한다. volume은 보존하고
기존 project container가 계속 running인지 확인한다.

### Task 6: Main merge와 resource cleanup

**Files:**

- Branch: local `main`

**Interfaces:**

- Consumes: review/verification-clean integration branch
- Produces: clean, locally testable main; no push/PR

- [ ] **Step 1: final main merge**

main이 integration base 이후 사용자 변경이 없는지 확인하고
`codex/wave7-integration`을 `--no-ff` merge한다.

- [ ] **Step 2: main fresh verification**

main에서 최소 다음을 다시 실행한다.

```bash
CHOKIDAR_USEPOLLING=1 pnpm test
pnpm infra:synth
git status --short
```

- [ ] **Step 3: generated artifact cleanup**

검증 중 생긴 repository 내부 `dist`, `coverage`, `.vite`, `cdk.out`을
정확한 path로 제거한다. `node_modules`, pnpm store, database volume,
user files는 보존한다.

- [ ] **Step 4: worktree/branch cleanup**

각 leaf/integration이 main에 fully merged인지 `git merge-base --is-ancestor`
로 확인한 뒤 worktree를 제거하고 local Wave 7 branches만 삭제한다.

- [ ] **Step 5: final evidence**

main working tree clean, FLEX THIA container stopped, volume preserved,
기존 project container running, push/PR 없음과 README 시작 명령을
최종 보고한다.
