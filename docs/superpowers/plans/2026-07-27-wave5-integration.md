# Wave 5 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wave 5 세 feature branch를 충돌 없이 조립하고 nullable DRAFT audio, TTS 게시 차단, runtime/API/infra, 단일 migration과 실제 PostgreSQL 검증을 완료해 local main에 통합한다.

**Architecture:** feature branch는 leaf module과 테스트를 제공하고 integration branch가 공용 barrel·DI·dispatcher·OpenAPI·infra route를 한 번만 수정한다. AI 문제 후보 승인으로 nullable-audio DRAFT와 TTS job·durable dispatch outbox를 한 transaction에서 만들고, retry도 item 상태 전이와 outbox 기록을 원자화한다. TTS provider run은 사용량·예상 비용·request ID와 outcome을 attempt별로 멱등 저장한다. TTS 성공 transaction이 검증된 media를 연결하며 게시 service가 READY 여부를 다시 검증한다. DB 완료 뒤 남은 immutable object는 참조 확인형 GC queue와 lifecycle policy로 정리한다. 모든 schema diff는 하나의 Drizzle migration으로 생성하고 실제 PostgreSQL에서 migration·seed·동시성·rollback·outbox redelivery를 검증한다.

**Tech Stack:** TypeScript 6, NestJS 11, Drizzle ORM, PostgreSQL 16, AWS CDK, React 19, Vitest, Docker Compose

## Global Constraints

- 세 feature branch는 계획 commit에서 분기하고 integration branch는 같은 commit에서 만든다.
- merge 순서는 `ai-question-production`, `automated-tts`, `learner-question-discovery`다.
- 원격 push와 PR은 하지 않는다.
- migration은 feature merge 뒤 integration branch에서 정확히 하나만 생성한다.
- DRAFT sentence만 null media를 허용하며 기존 PUBLISHED row와 manual input 계약을 약화하지 않는다.
- 게시 시 참조하는 모든 필수 media asset이 READY여야 한다.
- 외부 AI/TTS provider, SDK, credential과 유료 호출을 추가하지 않는다.
- Docker는 PostgreSQL·최종 smoke 구간에서만 실행하고 즉시 내린다.
- `docker compose down -v`를 실행하지 않는다.
- E2E runner/spec을 추가하지 않는다.
- `TtsRetryCoordinator.retryAndDispatch` 성공은 retry 상태 전이와 durable
  queue/outbox handoff가 함께 commit됐음을 뜻한다. repository retry 뒤
  best-effort queue send 구현은 금지한다.
- provider success 전후 crash에서도 TTS usage/cost를 중복 계상하지 않도록
  item attempt별 provider-run claim/outcome을 멱등 저장한다.
- object store write 뒤 DB 완료 실패는 참조 확인형 GC record 또는 동등한
  lifecycle cleanup으로 수렴해야 한다.

---

### Task 1: Merge feature branches and audit ownership

**Files:**

- Merge commits only
- Review: all files changed by three feature branches

**Interfaces:**

- Consumes: three reviewed feature branch heads
- Produces: one integration tree without common assembly

- [ ] **Step 1: Verify feature branch status**

  Run for each worktree:
  `git status --short && git log -1 --oneline`

  Expected: clean worktree and committed feature head.

- [ ] **Step 2: Merge in fixed order**

  Run:

  ```bash
  git merge --no-ff codex/ai-question-production
  git merge --no-ff codex/automated-tts
  git merge --no-ff codex/learner-question-discovery
  ```

- [ ] **Step 3: Resolve only declared overlaps**

  No content resolution is expected outside feature-local `index.ts`. Preserve
  both feature exports without reordering unrelated exports.

- [ ] **Step 4: Audit forbidden files**

  Run from the integration branch:
  `git diff --name-only "$(git merge-base HEAD main)"..HEAD`

  Verify feature commits did not change root package/lockfile, migration,
  AppModule, OpenAPI, infra or route tree.

### Task 2: Assemble public exports

**Files:**

- Modify: `backend/domain/src/index.ts`
- Modify: `backend/database/src/index.ts`
- Modify: `backend/database/src/schema/index.ts`
- Modify: `backend/providers/src/index.ts`
- Modify: `shared/contracts/src/index.ts`
- Modify existing feature-local barrels only when duplicate exports require it
- Test: existing barrel/import boundary specs

**Interfaces:**

- Produces public package imports for AI question, TTS and learner contracts

- [ ] **Step 1: Write failing public import tests**

  Import the new ports, schemas, repositories and contracts from their workspace
  package roots. Tests must fail before barrel changes.

- [ ] **Step 2: Run Red**

  Run:
  `pnpm --filter @flex-thia/domain typecheck && pnpm --filter @flex-thia/database typecheck && pnpm --filter @flex-thia/providers typecheck && pnpm --filter @flex-thia/contracts typecheck`

- [ ] **Step 3: Append exports at feature anchors**

  Add only Wave 5 exports. Do not sort or refactor existing barrels.

- [ ] **Step 4: Verify Green**

  Run the same four typecheck commands.

- [ ] **Step 5: Commit**

  `git commit -m "chore(wave5): expose integrated feature modules"`

### Task 3: Allow nullable audio only for generated DRAFTs

**Files:**

- Modify: `backend/database/src/schema/thai-content.schema.ts`
- Modify/Test: `backend/database/src/schema/thai-content.schema.spec.ts`
- Modify: `backend/domain/src/content-import/content-import.ts`
- Modify/Test: `backend/domain/src/content-import/content-draft.spec.ts`
- Modify/Test: `backend/domain/src/questions/question-admin.ts`
- Modify/Test: `backend/domain/src/questions/question-admin.spec.ts`

**Interfaces:**

- Existing `CanonicalDraftSentenceInput.mediaAssetId: string` remains required
  for manual/import APIs.
- New internal generated input:

```ts
interface GeneratedDraftSentenceInput
  extends Omit<CanonicalDraftSentenceInput, 'mediaAssetId'> {
  mediaAssetId: null;
}
```

- [ ] **Step 1: Write failing schema/domain tests**

  Generated DRAFT accepts null media. Existing manual replace/import rejects
  missing media. PUBLISHED validation still reports missing audio.

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/schema/thai-content.schema.spec.ts backend/domain/src/content-import/content-draft.spec.ts backend/domain/src/questions/question-admin.spec.ts`

- [ ] **Step 3: Make DB column nullable**

  Remove only `.notNull()` from `thaiSentenceVersions.mediaAssetId`. Do not
  change FK, media asset immutability or public sentence projections.

- [ ] **Step 4: Add generated-only validation path**

  Manual/admin canonical parsing still requires UUID and READY media.
  `GeneratedQuestionDraftRepository` uses the new internal null-media type.

- [ ] **Step 5: Verify and commit**

  Run the Red command plus domain/database typechecks.

  Commit:
  `git commit -m "feat(questions): allow pending TTS in generated drafts"`

### Task 4: Implement generated draft approval adapter

**Files:**

- Create: `backend/database/src/repositories/content-production/drizzle-generated-question-draft.repository.ts`
- Test: `backend/database/src/repositories/content-production/drizzle-generated-question-draft.repository.spec.ts`
- Integration test: same file or
  `drizzle-generated-question-draft.repository.integration.spec.ts`
- Modify only required question/content-production repository helpers

**Interfaces:**

- Implements: `GeneratedQuestionDraftRepository`
- Produces question + DRAFT version + nullable sentence versions + candidate link
  in one transaction

- [ ] **Step 1: Write failing transaction tests**

  Validate first approval, request replay, concurrent approval one draft,
  stale revision conflict, insert failure rollback and audit append.

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/repositories/content-production/drizzle-generated-question-draft.repository.spec.ts`

- [ ] **Step 3: Implement graph materialization**

  Resolve active type/topic/tags/vocabulary references, assign UUIDs,
  create question/version/sentences/blocks/options, save candidate approval link
  and audit in a single transaction. Every generated sentence starts with
  `mediaAssetId: null`.

- [ ] **Step 4: Verify unit Green**

  Run Red command and database typecheck.

- [ ] **Step 5: Commit**

  `git commit -m "feat(database): approve generated question drafts"`

### Task 5: Implement TTS target attachment and readiness

**Files:**

- Create: `backend/database/src/repositories/tts/drizzle-tts-target-attachment.repository.ts`
- Test: `backend/database/src/repositories/tts/drizzle-tts-target-attachment.repository.spec.ts`
- Create: `backend/database/src/queries/drizzle-content-tts-readiness.query.ts`
- Test: `backend/database/src/queries/drizzle-content-tts-readiness.query.spec.ts`
- Modify/Test: `backend/domain/src/questions/question-publication.ts`
- Modify/Test: `backend/domain/src/questions/question-publication.spec.ts`
- Modify/Test: `backend/database/src/repositories/drizzle-question-publication.repository.ts`

**Interfaces:**

- Implements: DB-local `TtsTargetAttachmentWriter`,
  `ContentTtsReadinessRepository`
- `TtsTargetAttachmentWriter.attach(transaction, input)`은
  `DrizzleTtsRepository.succeed`가 넘긴 동일 transaction을 사용한다.
- `QuestionPublicationService` consumes readiness before publishing

- [ ] **Step 1: Write failing attachment tests**

  Current DRAFT revision accepts READY media exactly once. Stale revision,
  PUBLISHED/frozen sentence and non-READY media do not attach.

- [ ] **Step 2: Write failing publication tests**

  MISSING, UPLOADING, REJECTED required targets produce
  `CONTENT_TTS_NOT_READY`; all READY permits existing publication transaction.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/repositories/tts/drizzle-tts-target-attachment.repository.spec.ts backend/database/src/queries/drizzle-content-tts-readiness.query.spec.ts backend/domain/src/questions/question-publication.spec.ts`

- [ ] **Step 4: Implement adapters and service guard**

  Readiness query covers every block/option/explanation sentence and referenced
  required pronunciation. Attach and item success remain in one DB transaction.

- [ ] **Step 5: Verify and commit**

  Run Red command plus domain/database typechecks.

  Commit:
  `git commit -m "feat(media): enforce TTS publication readiness"`

### Task 6: Runtime assembly

**Files:**

- Modify/Test: `backend/worker/src/content-production/content-production-dispatcher.ts`
- Modify/Test: `backend/worker/src/content-production/content-production-dispatcher.spec.ts`
- Modify/Test: `backend/worker/src/content-production-task.ts`
- Modify/Test: `backend/worker/src/content-production-task.spec.ts`
- Modify worker media task/runtime files or create
  `backend/worker/src/media/tts-task.ts`
- Modify provider/runtime factories used by local and production modes
- Create/Modify: shared async dispatch outbox schema, repository and relay under
  `backend/database/src/schema`, `backend/database/src/repositories/content-production`,
  `backend/worker/src/content-production`; payload kinds are
  `CONTENT_PRODUCTION` and `TTS`
- Create/Modify: TTS provider-run schema/repository under the same TTS
  database feature
- Create/Modify: unreferenced audio GC record/repository and worker cleanup task
- Modify generated draft approval adapter to create initial TTS job and dispatch
  outbox in its existing approval transaction

**Interfaces:**

- QUESTION_GENERATION dispatches `AiQuestionProductionProcessor`
- TTS queue/task dispatches `TtsProcessor`
- Local/test mode uses deterministic providers
- Production mode without provider config uses explicit unavailable processors
- Generated draft approval atomically writes target snapshots, TTS job/items and
  a durable dispatch outbox record. Request replay creates neither a second job
  nor a second outbox record.
- Question candidate regeneration atomically applies candidate/item/job state,
  audit and a `CONTENT_PRODUCTION` outbox row before returning 202. Request
  replay creates neither a second attempt nor a second outbox row.
- `TtsRetryCoordinator.retryAndDispatch` atomically applies optimistic retry and
  writes an outbox record. A relay claims outbox rows with lease/redelivery and
  marks delivery only after queue acceptance.
- TTS provider-run claim/outcome stores item ID, attempt, cache claim, provider,
  model, usage, estimated cost and provider request ID exactly once.
- DB completion failure after object write registers the storage key for
  reference-checking GC. GC deletes only when no READY media/cache references it.

- [ ] **Step 1: Write failing dispatcher tests**

  QUESTION_GENERATION and linked vocabulary→question call the AI question
  processor with the exact structured work item. Vocabulary-only behavior stays
  unchanged.

- [ ] **Step 2: Write failing TTS task tests**

  One event invokes one job, batch partial failures are item results rather than
  Lambda-wide failure, invalid event is terminal.

- [ ] **Step 3: Write failing durable orchestration tests**

  다음을 고정한다.

  - first approval → nullable-audio DRAFT + one TTS job + one outbox row
  - approval request replay → same job, no duplicate outbox
  - question regeneration → candidate/item/job/audit + one content-production
    outbox row in one transaction
  - question regeneration replay → same attempt, no duplicate outbox
  - question regeneration outbox-writer failure rolls back every state change
  - retry transition + outbox insert rollback together
  - dispatch failure leaves an undelivered outbox row and relay redelivery
  - duplicate relay delivery does not duplicate provider calls or usage/cost
  - provider success/unknown/failure stores one provider run per item attempt
  - DB completion rejection registers object GC; referenced READY object is not
    deleted and unreferenced object is eventually removed

- [ ] **Step 4: Run Red**

  Run:
  `pnpm exec vitest run backend/worker/src/content-production/content-production-dispatcher.spec.ts backend/worker/src/content-production-task.spec.ts backend/worker/src/media`

- [ ] **Step 5: Assemble runtime and durable relays**

  Keep external provider unavailable path explicit. Do not add provider package,
  model ID or credential. Use the shared database transaction for initial
  approval/job/outbox, question regeneration/outbox and retry/outbox. A shared
  leased relay dispatches both payload kinds after commit. Queue send and object
  delete remain relay side effects after commit.

- [ ] **Step 6: Verify and commit**

  Run worker tests and typecheck.

  Commit:
  `git commit -m "feat(worker): assemble Wave 5 processors"`

### Task 7: API module, OpenAPI and infra routes

**Files:**

- Modify/Test: `backend/api/src/app.module.ts`
- Modify/Test: `backend/api/src/app.module.spec.ts`
- Modify/create feature module files under `backend/api/src/content-production`
  and `backend/api/src/media`
- Modify/Test: `backend/api/src/openapi/openapi.spec.ts`
- Create/Test: `backend/providers/src/aws/sqs-async-dispatch.queue.ts`
- Create/Test: `backend/providers/src/storage/s3-tts-audio.store.ts`
- Modify/Test: `backend/worker/src/dispatch/async-dispatch-relay-task.ts`
- Modify/Test: `backend/worker/src/media/tts-entry-runtime.ts`
- Modify/Test: `infra/src/constructs/async-jobs.ts`
- Modify/Test: `infra/test/async-jobs.spec.ts`
- Modify/Test: `infra/src/application-stack.ts`
- Modify/Test: `infra/src/data-stack.ts`
- Modify/Test: `infra/test/data-stack.spec.ts`
- Modify/Test: `infra/src/constructs/http-api.ts`
- Modify/Test: `infra/test/http-api.spec.ts`

**Interfaces:**

- Registers question candidate and TTS operation controllers
- Protects every new route with ADMIN + enrolled MFA
- Creates separate CONTENT_PRODUCTION and TTS queues with DLQ/event-source
  mappings; TTS event source enables `ReportBatchItemFailures`
- Injects concrete queue-acceptance senders into the production relay and grants
  only the matching `sqs:SendMessage` permissions
- Schedules bounded relay drain and TTS audio GC invocations with retry-safe
  concurrency and grants their DB access
- Replaces production `UnavailableTtsAudioStore` with private S3 put,
  metadata-inspect and reference-safe delete; the adapter must preserve
  reserved storage keys, abort/deadline no-late-visibility and immutable
  metadata checks
- Grants task/GC only required media-bucket object permissions and adds the
  orphan-audio lifecycle policy without exposing storage keys through HTTP

- [ ] **Step 1: Write failing DI tests**

  AppModule resolves both feature modules in local and production configuration.
  Production worker composition must resolve two concrete queue acceptance
  adapters and a concrete TTS audio store; `Unavailable*` adapters are a test
  failure in configured production.

- [ ] **Step 2: Write failing OpenAPI/infra exact route tests**

  Add every GET/POST/DELETE candidate and TTS route with status 200/202/204,
  validation 400, auth 401/403, missing 404 and conflict 409 as applicable.
  CDK assertions must cover both queues/DLQs, TTS partial-batch event source,
  relay and GC schedules, queue URLs, least-privilege send/consume IAM,
  media-bucket put/get-head/delete permissions and orphan lifecycle rules.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/api/src/app.module.spec.ts backend/api/src/openapi/openapi.spec.ts backend/providers/src/aws/sqs-async-dispatch.queue.spec.ts backend/providers/src/storage/s3-tts-audio.store.spec.ts backend/worker/src/dispatch/async-dispatch-runtime.spec.ts backend/worker/src/media/tts-entry-runtime.spec.ts infra/test/http-api.spec.ts infra/test/async-jobs.spec.ts infra/test/data-stack.spec.ts`

- [ ] **Step 4: Implement modules and routes**

  Do not expose provider raw data or private storage keys. Gateway protected path
  list and OpenAPI path list must match. Production is not runtime-ready until
  the relay queue senders, queue/schedule event sources, S3 TTS store, bucket
  lifecycle and exact IAM grants are all synthesized and asserted.

- [ ] **Step 5: Verify and commit**

  Run Red command plus API/worker/providers/infra typechecks and synth. Assert
  the worker build still emits exactly six Lambda bundles.

  Commit:
  `git commit -m "feat(api): integrate Wave 5 operations"`

### Task 8: Generate one migration and local seed

**Files:**

- Create: `backend/database/drizzle/0016_wave5_question_tts.sql`
- Create: matching snapshot
- Modify: `backend/database/drizzle/meta/_journal.json`
- Modify: `backend/database/seed/local.sql`
- Modify/Test: `backend/database/src/commands/local-seed.spec.ts`
- Create/Test: `backend/database/src/schema/wave5-integration.schema.spec.ts`

**Interfaces:**

- Migration includes AI question tables, TTS tables and nullable sentence media
- Migration also includes shared async dispatch outbox, TTS provider runs,
  audio GC records, and nullable/check-constrained redacted AI candidate columns
- Seed includes deterministic active type examples, voice preset and TTS-ready
  local fixtures

- [ ] **Step 1: Generate migration from combined schema**

  Run once after all schema exports:
  `pnpm --filter @flex-thia/database exec drizzle-kit generate --config drizzle.local.config.ts --name wave5_question_tts`

  Verify the generated file is exactly
  `backend/database/drizzle/0016_wave5_question_tts.sql`.

- [ ] **Step 2: Write failing static migration tests**

  Journal/snapshot continuity, nullable column, unique candidate/validation/cache
  keys, outbox delivery/idempotency keys, provider-run item-attempt uniqueness,
  GC storage-key uniqueness, FK and check constraints, no destructive
  published-data rewrite.

- [ ] **Step 3: Write failing seed tests**

  Required type versions have criteria/examples. Voice preset references only
  deterministic local provider. Existing local learner/admin fixtures remain.

- [ ] **Step 4: Adjust generated SQL only for safe ordering/backfill**

  Preserve generated snapshot. Move/backfill statements only when PostgreSQL
  requires index/FK order. Do not create multiple Wave 5 migrations.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/database/src/schema/wave5-integration.schema.spec.ts backend/database/src/commands/local-seed.spec.ts`

  Commit:
  `git commit -m "feat(database): migrate Wave 5 production"`

### Task 9: Actual PostgreSQL validation

**Files:**

- Add/modify only DB integration specs for generated drafts, AI candidates, TTS
  claim/reuse/readiness and learner question query

**Interfaces:**

- Uses one local PostgreSQL window

- [ ] **Step 1: Start only PostgreSQL**

  Run:
  `docker compose up -d postgres`

- [ ] **Step 2: Reset and seed**

  Run:
  `DATABASE_URL=postgres://flex_thia:local_only_password@127.0.0.1:5432/flex_thia LOCAL_DATABASE_RESET=true pnpm --filter @flex-thia/database db:reset-seed:local`

- [ ] **Step 3: Run AI question DB tests sequentially**

  Set `AI_QUESTION_TEST_DATABASE_URL` to the local URL and run generated draft,
  candidate claim, approval replay, stale lease and rollback specs.

- [ ] **Step 4: Reset and run TTS DB tests sequentially**

  Reset/seed again, set `TTS_TEST_DATABASE_URL`, and run cache claim, reuse,
  partial failure, retry, attachment and readiness specs. Also run:

  - two-connection cache claim and media/cache/item/attachment rollback
  - initial approval/job/outbox atomicity and request replay
  - question regeneration state/audit/outbox atomicity, request replay,
    writer-failure rollback and relay redelivery
  - retry/outbox rollback, lease/redelivery and duplicate delivery
  - provider-run usage/cost exact-once persistence across replay
  - object GC registration and reference-safe deletion

- [ ] **Step 5: Reset and run learner query DB case**

  Reset/seed again, set `LEARNER_QUESTION_QUERY_TEST_DATABASE_URL`, and run
  `drizzle-learner-question.query.spec.ts` with no integration skip.

- [ ] **Step 6: Stop Docker immediately**

  Run:
  `docker compose down`

  Confirm no running project container. Do not delete volume.

### Task 10: Review, full verification and local main merge

**Files:**

- Review complete integration diff

- [ ] **Step 1: Request code review**

  Review security/redaction, transactions, state transitions, schema/migration,
  API/OpenAPI/infra and UI contract. Explicitly review initial TTS job creation,
  retry durable dispatch, provider usage/cost exact-once accounting and object
  GC convergence. Fix every Critical/Important finding.

- [ ] **Step 2: Run full check**

  Run:
  `CHOKIDAR_USEPOLLING=1 pnpm check`

  Expected: structure, format, architecture, lint, typecheck, all unit/component
  tests, web coverage and every build PASS.

- [ ] **Step 3: Clean generated artifacts**

  Remove exact project `dist`, `coverage`, `.vite`, `cdk.out`. Preserve
  node_modules, pnpm store and DB volume.

- [ ] **Step 4: Commit integration**

  Run:
  `git add -A && git commit -m "feat(wave5): integrate question production and TTS"`

- [ ] **Step 5: Merge to local main**

  From clean main:
  `git merge --no-ff codex/wave5-integration`

- [ ] **Step 6: Verify merged tree**

  Confirm `git diff --exit-code codex/wave5-integration HEAD`, then run
  `pnpm test` on main.

- [ ] **Step 7: Clean worktrees and branches**

  Remove only clean Wave 5 worktrees under `.worktrees/`, prune worktree
  metadata and delete fully merged local feature/integration branches.

- [ ] **Step 8: Final resource check**

  Confirm clean `git status`, no running Docker container and no project
  `dist`, `coverage`, `.vite`, `cdk.out`.
