# Wave 6 Admin Automation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 콘텐츠 제작, TTS 운영, AI·TTS 사용량·비용을 관리자가 실제
상태와 연결해 운영할 수 있는 세 콘솔을 구현한다.

**Architecture:** `main`에서 세 leaf worktree를 만들고 콘텐츠 제작, TTS,
사용량·비용을 병렬 구현한다. 각 branch는 전용 계약·도메인·DB·API·frontend
slice만 수정하고, 공용 module/barrel/OpenAPI/route/navigation/migration은
통합 branch가 세 결과를 병합한 뒤 한 번만 연결한다.

**Tech Stack:** TypeScript, Zod, NestJS, Drizzle PostgreSQL, Vite React,
TanStack Router/Query, Tailwind CSS, Vitest, AWS CDK

## Global Constraints

- 기준 설계는 `docs/superpowers/specs/2026-07-28-wave6-admin-automation-ui-design.md`다.
- 외부 유료 AI·TTS provider, SDK와 network call을 추가하지 않는다.
- provider 원문, provider request ID, storage key, 인증 정보를 공개하지 않는다.
- 금액은 USD decimal 문자열로 전달하며 JavaScript number로 변환하지 않는다.
- 모든 관리자 API와 route는 기존 ADMIN + 등록된 MFA 경계를 상속한다.
- 요청 schema는 strict이며 unknown key를 거절한다.
- 새 코드와 변경 코드는 `conventions/comment-convention.md`를 따른다.
- frontend는 `conventions/frontend/component-convention.md`와 FSD 공개 API를 따른다.
- 테스트 설명은 한국어로 작성한다.
- E2E를 추가하지 않는다.
- 수동 파일 수정은 `apply_patch`로 한다.
- Docker는 PostgreSQL 검증 때만 켜고 즉시 `docker compose down`하며 volume을 지우지 않는다.
- 생성된 정확한 `dist`, `coverage`, `.vite`, `cdk.out`만 지우고 `node_modules`와 pnpm store를 보존한다.
- 공용 hotspot인 `backend/api/src/app.module.ts`, package root barrel,
  `backend/api/src/openapi/openapi.spec.ts`, `infra/src/constructs/http-api.ts`,
  `frontend/web/src/app/routing/adminNavigation.ts`,
  `frontend/web/src/app/routes/__root.tsx`,
  `frontend/web/src/routeTree.gen.ts`, route reachability/redirect 공용 테스트,
  `frontend/web/src/pages/admin-home/**`, migration journal/snapshot/local seed는
  leaf branch에서 수정하지 않는다.

---

### Task 1: Three isolated Wave 6 leaf worktrees

**Files:**

- Worktree: `.worktrees/wave6-content-production`
- Worktree: `.worktrees/wave6-tts-operations`
- Worktree: `.worktrees/wave6-usage-cost`

**Interfaces:**

- Consumes: clean local `main`
- Produces: `codex/wave6-content-production`,
  `codex/wave6-tts-operations`, `codex/wave6-usage-cost`

- [ ] **Step 1: Verify the base and ignore boundary**

Run:

```bash
git status --short
git check-ignore -q .worktrees
git rev-parse main
```

Expected: clean status, ignored `.worktrees`, and all three branches use the
same main SHA.

- [ ] **Step 2: Create the three named worktrees**

Run `git worktree add <exact path> -b <exact branch> main` once per branch.

- [ ] **Step 3: Link the frozen workspace**

Run `CI=true pnpm install --frozen-lockfile` only when a worktree is missing
workspace links. Do not change `pnpm-lock.yaml`.

- [ ] **Step 4: Verify focused clean baselines**

Run contracts/domain/database/API/worker/web typechecks and the existing
Wave 5 candidate/TTS specs in their owning worktree. Expected: PASS and no
generated artifacts after cleanup.

### Task 2: Content production strict snapshots and deterministic item plan

**Files:**

- Modify: `shared/contracts/src/content-production/content-production.ts`
- Modify: `shared/contracts/src/content-production/content-production.spec.ts`
- Modify: `backend/domain/src/content-production/content-production.service.ts`
- Modify: `backend/domain/src/content-production/content-production.service.spec.ts`
- Modify: `backend/domain/src/content-production/content-production-work-item.ts`
- Modify: `backend/domain/src/content-production/content-production-work-item.spec.ts`
- Modify: `backend/domain/src/content-production/ai-question-production.ts`
- Modify: `backend/domain/src/content-production/ai-question-production.spec.ts`
- Modify: `backend/worker/src/content-production/content-production-dispatcher.ts`
- Modify: `backend/worker/src/content-production/content-production-dispatcher.spec.ts`

**Interfaces:**

- Produces: strict `ContentProductionEffectiveOptions`,
  `QuestionProductionPlanItem`, immutable snapshot expansion
- Consumes: enabled preset snapshot and verified upload IDs

- [ ] **Step 1: Add RED contract tests**

Test exact bounds and relationships from the design: `questionCount` 1..100,
unique type/difficulty entries whose counts each sum to `questionCount`,
three disjoint vocabulary ID sets, auxiliary limit 0..100, threshold 0..1,
enabled default/role voice presets, Korean instruction max 2,000, purpose
compatibility and unknown-key rejection.

Run:

```bash
pnpm --filter @flex-thia/contracts test -- content-production.spec.ts
```

Expected: FAIL because the strict effective option schema does not exist.

- [ ] **Step 2: Implement the strict public contract**

Replace public `Record<string, unknown>` consumption with a discriminated
strict option schema while preserving stored legacy preset parsing only
inside the database adapter. Export every response/request type used by API
and frontend.

- [ ] **Step 3: Add RED domain planning tests**

Assert stable expansion order, exactly `questionCount` question items,
one type/difficulty per item, snapshot equality on idempotent replay, and
unchanged snapshot on retry.

- [ ] **Step 4: Implement minimal deterministic expansion**

Expand the type and difficulty count lists in declared order and zip them
by ordinal. Store each resulting pair in its work item. Do not change the
candidate review state machine.

- [ ] **Step 5: Verify and commit**

Run focused contract/domain/dispatcher specs, three workspace typechecks,
lint/Prettier/diff. Commit:

```text
feat(content-production): add strict generation plans
```

### Task 3: Content preview, preset versions and job-scoped candidates

**Files:**

- Modify: `backend/database/src/queries/drizzle-question-production-context.query.ts`
- Modify: `backend/database/src/queries/drizzle-question-production-context.query.spec.ts`
- Modify: `backend/database/src/queries/drizzle-question-candidate.query.ts`
- Modify: `backend/database/src/queries/drizzle-question-candidate.query.spec.ts`
- Create: `backend/database/src/queries/drizzle-content-production-preset.query.ts`
- Create: `backend/database/src/queries/drizzle-content-production-preset.query.spec.ts`
- Create: `backend/database/src/repositories/content-production/drizzle-content-production-preset.repository.ts`
- Create: `backend/database/src/repositories/content-production/drizzle-content-production-preset.repository.spec.ts`
- Modify: `backend/api/src/content-production/content-production.dto.ts`
- Modify: `backend/api/src/content-production/content-production.controller.ts`
- Modify: `backend/api/src/content-production/content-production.controller.spec.ts`
- Modify: `backend/api/src/content-production/content-production.service.ts`
- Modify: `backend/api/src/content-production/content-production.service.spec.ts`
- Create: `backend/api/src/content-production/content-production-presets.controller.ts`
- Create: `backend/api/src/content-production/content-production-presets.controller.spec.ts`
- Create: `backend/api/src/content-production/content-production-presets.service.ts`
- Create: `backend/api/src/content-production/content-production-presets.service.spec.ts`

**Interfaces:**

- Produces: `POST /admin/content-production/prompt-previews`,
  leaf preset controller/service, `jobId` candidate filter/projection
- Consumes: Task 2 effective options and existing prompt builder

- [ ] **Step 1: Write preview parity RED tests**

Preview and create must call one resolver, return the same prompt version and
byte-equivalent final prompt, reject disabled/mismatched presets, and exclude
provider/storage/private values.

- [ ] **Step 2: Implement shared resolver and preview**

Wire the existing context query and `buildQuestionGenerationPrompt` within
the content-production module leaf. Store only resolved strict options in
the immutable job snapshot.

- [ ] **Step 3: Write preset version RED tests**

Cover create, next immutable version, enable/disable, duplicate
`name + version`, disabled selection, optimistic conflict and audit command.

- [ ] **Step 4: Implement preset query/repository/API leaf**

Never update a version's parameters. Disabling affects future selection only
and hard delete is absent.

- [ ] **Step 5: Add job-scoped candidate RED tests and implementation**

Join candidate → job item → job, expose safe `jobId`, and filter before
pagination. Preserve redaction and candidate mutation behavior.

- [ ] **Step 6: Verify and commit**

Run focused DB/API specs, typecheck, lint/format/diff. Commit:

```text
feat(content-production): add preview and preset operations
```

### Task 4: Content production worker voice routing and frontend leaf

**Files:**

- Modify: `backend/database/src/repositories/content-production/drizzle-generated-question-tts.scheduler.ts`
- Modify: `backend/database/src/repositories/content-production/drizzle-generated-question-tts.scheduler.spec.ts`
- Modify: `backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.ts`
- Modify: `backend/database/src/repositories/content-production/drizzle-ai-question-production.repository.spec.ts`
- Create: `frontend/web/src/pages/content-production-console/**`
- Create: `frontend/web/src/pages/content-production-job-detail/**`
- Create: `frontend/web/src/pages/content-production-preset-management/**`
- Create: `frontend/web/src/pages/question-candidate-management/**`
- Create: `frontend/web/src/pages/question-candidate-detail/**`
- Create: `frontend/web/src/features/review-question-candidates/**`

**Interfaces:**

- Produces: preset-grouped TTS jobs on approval and five public page slices
- Consumes: Tasks 2–3 contracts/API and existing candidate commands

- [ ] **Step 1: Add RED scheduler tests**

Assert speaker assignment match, default fallback, one item per required
sentence, preset-grouped jobs, all groups in the approval transaction and
rollback of every group on one writer failure.

- [ ] **Step 2: Implement preset grouping**

Resolve enabled immutable voice snapshots before approval and create one TTS
job per distinct preset in the existing approval transaction.

- [ ] **Step 3: Add frontend API/model RED tests**

Cover query serialization, strict form totals/disjoint sets, preview/create
parity, upload policy→form upload→complete order, candidate filters,
fresh request IDs and partial bulk result preservation.

- [ ] **Step 4: Implement frontend leaf pages/features**

Use shared UI primitives, accessible labels/keyboard state, independent
loading/empty/error states, 404/409 recovery and TanStack Query invalidation.
Do not create route files or edit common navigation, root titles, generated
route tree or admin home.

- [ ] **Step 5: Verify and commit**

Run focused database/frontend specs, architecture check, typechecks,
lint/format/diff. Commit:

```text
feat(web): add content production console
```

### Task 5: TTS preset versions and atomic retry audit

**Files:**

- Create: `shared/contracts/src/media/tts-voice-presets.ts`
- Create: `shared/contracts/src/media/tts-voice-presets.spec.ts`
- Create: `backend/domain/src/media/tts-voice-preset.ts`
- Create: `backend/domain/src/media/tts-voice-preset.spec.ts`
- Create: `backend/domain/src/media/tts-voice-preset.repository.ts`
- Create: `backend/database/src/queries/drizzle-tts-voice-preset.query.ts`
- Create: `backend/database/src/queries/drizzle-tts-voice-preset.query.spec.ts`
- Create: `backend/database/src/repositories/tts/drizzle-tts-voice-preset.repository.ts`
- Create: `backend/database/src/repositories/tts/drizzle-tts-voice-preset.repository.spec.ts`
- Modify: `backend/database/src/repositories/tts/drizzle-tts-retry-coordinator.ts`
- Modify: corresponding retry unit/integration specs
- Create: `backend/api/src/media/tts-voice-presets.controller.ts`
- Create: controller/service/DTO specs and implementation

**Interfaces:**

- Produces: immutable voice preset CRUD/version leaf and
  `TtsOperationAuditContext`
- Consumes: active preset ID from validated API environment

- [ ] **Step 1: Write strict preset contract/domain RED tests**

Cover create/version/list/detail, enabled/active projection, duplicate
revision, optimistic enable/disable, active disable 409, and no delete.

- [ ] **Step 2: Implement row-as-version repository and API leaf**

Create new rows for changes. Read active ID without silently choosing a
fallback. Write audit in the same transaction as enable/disable.

- [ ] **Step 3: Add retry transaction RED tests**

Assert retry state, outbox and `TTS_ITEMS_RETRIED` audit commit/rollback
together and exact replay does not duplicate audit.

- [ ] **Step 4: Implement minimal retry audit**

Pass authenticated actor/request context from Controller to coordinator
without exposing actor fields in the body.

- [ ] **Step 5: Verify and commit**

Run focused contract/domain/DB/API tests including PostgreSQL-gated specs
later in integration. Commit:

```text
feat(tts): add preset versions and retry audit
```

### Task 6: TTS audio, readiness and frontend leaf

**Files:**

- Modify: `shared/contracts/src/media/tts-operations.ts`
- Modify: `shared/contracts/src/media/tts-operations.spec.ts`
- Modify: `backend/database/src/queries/drizzle-tts-operations.query.ts`
- Modify: `backend/database/src/queries/drizzle-tts-operations.query.spec.ts`
- Modify: `backend/database/src/queries/drizzle-content-tts-readiness.query.ts`
- Modify: corresponding readiness specs
- Modify: `backend/api/src/media/tts-operations.controller.ts`
- Modify: `backend/api/src/media/tts-operations.service.ts`
- Modify: DTO/controller/service specs
- Modify: `backend/api/src/common/errors/domain-exception.filter.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.spec.ts`
- Create: `frontend/web/src/pages/tts-operations/**`
- Create: `frontend/web/src/pages/admin-tts-job-detail/**`
- Create: `frontend/web/src/pages/tts-preset-management/**`
- Create: `frontend/web/src/features/retry-tts-items/**`

**Interfaces:**

- Produces: click-time audio URL, publication readiness projection,
  TTS list/detail/preset frontend pages
- Consumes: existing `MediaReadUrlProvider` and Task 5 preset/retry contracts

- [ ] **Step 1: Write audio/readiness RED tests**

Test 404 missing item, 409 non-ready, signed URL only for SUCCEEDED+READY,
no storage key, blocker target kind/status, linked job/item error and retry.

- [ ] **Step 2: Implement query/service/controller leaf**

Issue URLs only on click. Keep validation and TTS readiness separate.
Map `CONTENT_TTS_NOT_READY` to stable 409.

- [ ] **Step 3: Write frontend RED tests**

Cover status/date/error filters, selection eligibility, stale attempt
refetch, playback loading/expiry recovery, blocker links and disabled publish.

- [ ] **Step 4: Implement TTS page/feature slices**

Do not create route files or modify shared integration hotspots. Use
page-owned server state and feature-owned retry behavior.

- [ ] **Step 5: Verify and commit**

Run focused tests, architecture/typecheck/lint/format/diff. Commit:

```text
feat(web): add TTS operations console
```

### Task 7: Usage-cost schema, query, settings and API leaf

**Files:**

- Create: `shared/contracts/src/operations/usage-cost.ts`
- Create: `shared/contracts/src/operations/usage-cost.spec.ts`
- Create: `backend/database/src/schema/usage-cost.schema.ts`
- Create: `backend/database/src/schema/usage-cost.schema.spec.ts`
- Create: `backend/database/src/queries/drizzle-usage-cost-operations.query.ts`
- Create: `backend/database/src/queries/drizzle-usage-cost-operations.query.spec.ts`
- Create: `backend/database/src/repositories/operations/drizzle-usage-cost-settings.repository.ts`
- Create: repository unit and PostgreSQL integration specs
- Create: `backend/api/src/operations/usage-cost.controller.ts`
- Create: controller/service/DTO specs and implementation

**Interfaces:**

- Produces: `GET /admin/usage-cost`, `GET /admin/usage-cost/settings`,
  `PUT /admin/usage-cost/settings`
- Consumes: provider run tables, candidate review state and audit writer

- [ ] **Step 1: Write contract/schema RED tests**

Fix exact UTC range filters, normalized source/status, decimal strings,
breakdown shape, singleton USD settings, 15/24 defaults,
`0 < warning < critical`, `expectedUpdatedAt` and UUID `requestId`.

- [ ] **Step 2: Implement contract and Drizzle schema definition**

Do not generate SQL or edit migration metadata in this branch.

- [ ] **Step 3: Add aggregation RED tests**

Cover AI/TTS UNION ALL, exact-once provider runs, TTS immutable voice join,
finished-time cost, job-level running count, failed run count, pending
candidate count and no private columns.

- [ ] **Step 4: Implement read query**

Keep numeric values as PostgreSQL decimal text from DB to JSON.

- [ ] **Step 5: Add settings repository/API RED tests**

Test default singleton, optimistic update, exact replay, conflict,
transactional audit and rollback.

- [ ] **Step 6: Implement settings repository/API leaf**

The warning status is display-only and never cancels provider work.

- [ ] **Step 7: Verify and commit**

Run focused contract/database/API tests, typechecks/lint/format/diff. Commit:

```text
feat(operations): add usage cost reporting
```

### Task 8: Usage-cost frontend leaf

**Files:**

- Create: `frontend/web/src/pages/usage-cost-operations/api/usageCostQueries.ts`
- Create: query/mutation tests
- Create: `frontend/web/src/pages/usage-cost-operations/model/usageCostSearch.ts`
- Create: model tests
- Create: `frontend/web/src/pages/usage-cost-operations/ui/UsageCostOperationsPageContainer.tsx`
- Create: `frontend/web/src/pages/usage-cost-operations/ui/UsageCostOperationsPageView.tsx`
- Create: component tests
- Create: `frontend/web/src/pages/usage-cost-operations/index.ts`

**Interfaces:**

- Produces: `/admin/usage-cost` page slice
- Consumes: Task 7 contracts/API

- [ ] **Step 1: Write model/API RED tests**

Cover UTC month default, strict URL filters, stable query keys, decimal text,
settings optimistic input and 409 refetch.

- [ ] **Step 2: Implement query/model**

Never parse USD strings into number; format for display with a decimal-safe
string formatter.

- [ ] **Step 3: Write component RED tests**

Cover summary, warning/critical state, breakdown, failures/running/pending,
loading/empty/error, settings validation/save/conflict and keyboard labels.

- [ ] **Step 4: Implement page leaf**

Do not create route files or edit common navigation, root title, route tree
or admin home.

- [ ] **Step 5: Verify and commit**

Run focused web suite, architecture/typecheck/lint/format/diff. Commit:

```text
feat(web): add usage cost operations
```

### Task 9: Serial integration wiring and single migration

**Files:**

- Modify: package root barrels for contracts/domain/database
- Modify: feature Nest modules and `backend/api/src/app.module.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Modify: `infra/src/constructs/http-api.ts`
- Modify: `infra/test/http-api.spec.ts`
- Modify: `backend/database/src/schema/index.ts`
- Generate: next single Drizzle migration, snapshot and journal entry
- Modify: `backend/database/seed/local.sql`
- Create: content-production, TTS and usage-cost route files under
  `frontend/web/src/app/routes/`
- Modify: `frontend/web/src/app/routing/adminNavigation.ts`
- Modify: route title/reachability/redirect/navigation tests
- Generate: `frontend/web/src/routeTree.gen.ts`
- Modify: `frontend/web/src/pages/admin-home/**`

**Interfaces:**

- Consumes: all three reviewed leaf heads
- Produces: one deployable Wave 6 integration branch

- [ ] **Step 1: Merge leaf branches and resolve only declared hotspots**

Before merge, require each leaf worktree clean and reviewed. Reject unrelated
edits or duplicate barrel/module wiring.

- [ ] **Step 2: Add public-boundary RED tests**

Test package root imports, AppModule/controller ownership, exact OpenAPI and
Gateway routes, route reachability/title/role navigation and independent
admin-home card failure.

- [ ] **Step 3: Wire backend and infrastructure once**

Add ADMIN+MFA controllers, exact API routes and least-privilege dependencies.

- [ ] **Step 4: Generate migration exactly once**

Generate the next Drizzle SQL/snapshot from schema changes. Review for only
the cost settings table/check/default and any design-approved indexes.

- [ ] **Step 5: Seed deterministic local operations state**

Add coherent enabled/disabled/active presets, provider cost runs, settings,
candidate/TTS failure/running/readiness fixtures without changing published
immutability.

- [ ] **Step 6: Wire frontend common integration**

Add three navigation entries and titles, regenerate route tree, update
allowlists/reachability and add independently recoverable admin-home cards.

- [ ] **Step 7: Verify and commit**

Run affected package tests/typechecks, architecture, OpenAPI/infra,
format/lint/diff. Commit:

```text
feat(wave6): integrate admin automation consoles
```

### Task 10: Actual PostgreSQL and full main verification

**Files:**

- Modify only defects proven by the validation gates

**Interfaces:**

- Consumes: Task 9 integration head
- Produces: reviewed local main ready for Wave 7

- [ ] **Step 1: Start only PostgreSQL**

Run `docker compose up -d postgres`.

- [ ] **Step 2: Reset/migrate/seed**

Use the documented local `DATABASE_URL` and
`LOCAL_DATABASE_RESET=true pnpm --filter @flex-thia/database db:reset-seed:local`.

- [ ] **Step 3: Run every new opt-in PostgreSQL spec sequentially**

Cover content snapshot/replay and multi-voice approval rollback, preset
conflicts/audits, TTS retry audit/audio/readiness, usage UNION and settings
replay/audit.

- [ ] **Step 4: Stop Docker immediately**

Run `docker compose down`, preserve volume, and confirm no project container.

- [ ] **Step 5: Request whole-branch review**

Review redaction, transactions, state transitions, decimal cost handling,
strict contracts, route/API/OpenAPI parity, accessibility and branch
ownership. Fix every Critical/Important finding and scoped re-review it.

- [ ] **Step 6: Run full check**

Run:

```bash
CHOKIDAR_USEPOLLING=1 pnpm check
```

Expected: structure, format, architecture, lint, typecheck, tests, coverage
and builds PASS.

- [ ] **Step 7: Clean artifacts and merge local main**

Remove exact generated project artifacts, merge with `--no-ff`, refresh
frozen workspace links if necessary, and run `pnpm test` on main.

- [ ] **Step 8: Clean merged worktrees and branches**

Only after clean main tests, remove clean Wave 6 worktrees and fully merged
local branches. Do not push or create a PR.
