# Wave 7 Product Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기획에 남은 AI 어휘 후보 검수, portal 전환, 어휘 학습 정보,
home 운영 카드와 실제 문제 검수·TTS 재생성 기능을 공개 API와 화면까지
완성한다.

**Architecture:** 각 기능은 contracts→domain/database→API→frontend의 세로
단위로 완성한다. 어휘 후보 승인은 완전한 pronunciation/media graph로
DRAFT를 생성하거나 기존 어휘에 연결하며, 문제 검수는 관리자 projection에
resolved Thai content를 포함하고 기존 TTS scheduler를 version command로
조정한다.

**Tech Stack:** TypeScript, Zod, NestJS, Drizzle PostgreSQL, Vite React,
TanStack Router/Query, Tailwind CSS, Vitest

## Global Constraints

- 기준 설계는 `docs/superpowers/specs/2026-07-31-wave7-full-product-hardening-design.md`다.
- 외부 유료 provider, SDK, network call과 새 package를 추가하지 않는다.
- ADMIN은 learner capability를 포함하지만 LEARNER는 admin capability를 얻지 않는다.
- 후보 승인으로 생성한 어휘는 `DRAFT`이며 자동 게시하지 않는다.
- 중복 분류 후보의 새 DRAFT 생성은 `confirmDuplicate: true`를 요구한다.
- production provider 미설정은 fail-closed를 유지한다.
- migration과 `routeTree.gen.ts` 생성은 통합 branch가 수행한다.
- local adapter, compose, infra, workflow, Vite config는 수정하지 않는다.
- 새 코드와 변경 코드는 comment/structure/backend/frontend convention을 따른다.
- 테스트 설명은 한국어로 작성하고 E2E를 추가하지 않는다.
- production code보다 실패하는 테스트를 먼저 작성하고 RED 원인을 확인한다.
- 공용 조립 파일 변경은 각 task 마지막 commit에 제한한다.

---

### Task 1: AI 어휘 후보 공개 계약과 review domain

**Files:**

- Create: `shared/contracts/src/content-production/vocabulary-candidates.ts`
- Create: `shared/contracts/src/content-production/vocabulary-candidates.spec.ts`
- Modify: `shared/contracts/src/index.ts`
- Create: `backend/domain/src/content-production/vocabulary-candidate-review.ts`
- Create: `backend/domain/src/content-production/vocabulary-candidate-review.spec.ts`
- Modify: `backend/domain/src/content-production/index.ts`

**Interfaces:**

- Produces: list/detail query, `CREATE_DRAFT | LINK_EXISTING` approve command,
  discard command, optimistic revision errors
- Consumes: existing `VocabularyProductionCandidateRecord`와 validation snapshot

- [ ] **Step 1: strict contract RED tests 작성**

다음 literal behavior를 분리해 검증한다.

```ts
expect(
  vocabularyCandidateApproveRequestSchema.parse({
    action: 'LINK_EXISTING',
    expectedRevision: 3,
    requestId: '00000000-0000-4000-8000-000000000001',
    vocabularyId: '00000000-0000-4000-8000-000000000002',
  }),
).toMatchObject({ action: 'LINK_EXISTING' });
```

`CREATE_DRAFT`는 최소 한 meaning, pronunciation, sealed media asset ID와
meaning-pronunciation mapping을 요구한다. unknown key, 빈 graph,
중복 reference, 잘못된 page/revision/request ID는 거절한다.

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --filter @flex-thia/contracts test -- vocabulary-candidates.spec.ts
```

Expected: schema/export가 없어 FAIL.

- [ ] **Step 3: strict Zod 계약 구현**

public response는 provider raw payload, private input key, storage key,
internal run ID를 포함하지 않는다. 상태는 `PENDING`, `APPROVED`,
`DISCARDED`, action은 `CREATE_DRAFT`, `LINK_EXISTING`으로 제한한다.

- [ ] **Step 4: domain transition RED tests 작성**

PENDING만 승인·폐기 가능하고 stale revision을 거절하며 idempotent
`requestId` replay는 같은 결과를 반환한다. NEW가 아닌 후보의
`CREATE_DRAFT`는 `confirmDuplicate: true`가 없으면 실패한다.

- [ ] **Step 5: minimal review service/port 구현**

domain은 transaction implementation을 모르며 다음 command 결과만
조정한다.

```ts
type VocabularyCandidateApprovalResult = {
  candidateId: string;
  reviewStatus: 'APPROVED';
  revision: number;
  resolution:
    | { kind: 'DRAFT_CREATED'; vocabularyId: string; versionId: string }
    | { kind: 'EXISTING_LINKED'; vocabularyId: string };
};
```

- [ ] **Step 6: GREEN과 task commit**

Run contracts/domain focused tests와 typecheck. Commit:

```text
feat(content-production): define vocabulary candidate review
```

### Task 2: 어휘 후보 lifecycle schema와 원자 materialization

**Files:**

- Modify: `backend/database/src/schema/ai-vocabulary-production.schema.ts`
- Modify: corresponding schema spec
- Create: `backend/database/src/queries/content-production/drizzle-vocabulary-candidate.query.ts`
- Create: corresponding query spec
- Create: `backend/database/src/repositories/content-production/drizzle-vocabulary-candidate-review.repository.ts`
- Create: corresponding repository spec
- Modify: database public barrel only in final task hunk

**Interfaces:**

- Implements: Task 1 review query/repository port
- Produces: atomic candidate state/revision/resolution, DRAFT vocabulary graph,
  audit replay
- Consumes: vocabulary/meaning/pronunciation/media tables and existing
  vocabulary graph validation

- [ ] **Step 1: schema/query RED tests 작성**

candidate row에 `reviewStatus`, `revision`, `resolutionKind`,
`resolvedVocabularyId`, `reviewedBy`, `reviewedAt`, `updatedAt`이 필요하다.
list는 status/jobId를 pagination 전에 적용하고 detail은 validations를
ordinal 순으로 반환한다.

- [ ] **Step 2: repository transition RED tests 작성**

`CREATE_DRAFT` 한 transaction이 다음 전부를 commit/rollback하는지
검증한다.

```text
candidate APPROVED + revision increment
vocabulary DRAFT + version
meanings + pronunciations + mappings
VOCABULARY_CANDIDATE_APPROVED audit
idempotency replay record
```

`LINK_EXISTING`은 existing vocabulary 존재를 확인하지만 graph를 변경하지
않는다. discard는 vocabulary row를 만들지 않는다.

- [ ] **Step 3: RED 확인**

Run:

```bash
pnpm --filter @flex-thia/database test -- vocabulary-candidate
```

Expected: lifecycle columns/repository가 없어 FAIL.

- [ ] **Step 4: 최소 schema/query/repository 구현**

graph validation은 vocabulary domain의 strict validator를 재사용한다.
sealed READY audio asset만 pronunciation에 연결한다. duplicate confirm,
stale revision, replay와 concurrent approval을 DB transaction에서
보장한다.

- [ ] **Step 5: GREEN과 task commit**

Run focused database tests/typecheck. Migration 생성은 하지 않는다.
Commit:

```text
feat(database): review vocabulary candidates atomically
```

### Task 3: 관리자 어휘 후보 API와 검수 화면

**Files:**

- Create: `backend/api/src/content-production/vocabulary-candidates.controller.ts`
- Create: corresponding controller spec
- Create: `backend/api/src/content-production/vocabulary-candidates.service.ts`
- Create: corresponding service spec
- Modify: `backend/api/src/content-production/content-production.module.ts`
- Modify: module spec
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Create: `frontend/web/src/pages/vocabulary-candidate-management/**`
- Create: `frontend/web/src/pages/vocabulary-candidate-detail/**`
- Create: `frontend/web/src/features/review-vocabulary-candidate/**`
- Create: route files under `frontend/web/src/app/routes`
- Modify: existing admin navigation/reachability tests only in final hunk

**Interfaces:**

- Produces:
  - `GET /admin/content-production/vocabulary-candidates`
  - `GET /admin/content-production/vocabulary-candidates/:candidateId`
  - `POST .../:candidateId/approve`
  - `DELETE .../:candidateId`
- Consumes: Tasks 1~2 contracts/service/repository

- [ ] **Step 1: API RED tests 작성**

ADMIN+MFA, strict DTO, 400/401/403/404/409 metadata, safe response projection과
fresh request ID를 검증한다. OpenAPI는 네 route의 request/response/problem
schema와 security를 포함해야 한다.

- [ ] **Step 2: API 구현과 GREEN**

controller는 actor를 service에 전달하고 business rule/SQL을 포함하지
않는다. app module은 review service/query를 한 번 조립한다.

- [ ] **Step 3: frontend API/model RED tests 작성**

status/job/page serialization, detail validation rendering, complete
pronunciation graph form, duplicate confirmation, stale 409 reload,
mutation 중복 방지와 invalidation을 검증한다.

- [ ] **Step 4: page/feature 구현**

목록은 pending/failed/approved/discarded를 구분한다. 상세는 extraction
snapshot과 validation을 변경 불가능하게 보여주고 create/link/discard
action을 분리한다. raw provider/private 값은 표시하지 않는다.

- [ ] **Step 5: focused verification과 commit**

Run API/web focused tests, architecture/typecheck, Swagger generation.
Commit:

```text
feat(admin): review vocabulary production candidates
```

### Task 4: ADMIN learner portal 전환과 root redirect

**Files:**

- Modify: `frontend/web/src/app/routing/guards.ts`
- Modify: `frontend/web/src/app/routing/guards.test.ts`
- Modify: `frontend/web/src/app/routes/index.tsx`
- Create or modify: colocated root route test
- Modify: `frontend/web/src/app/routes/_authenticated._learner.tsx`
- Modify: `frontend/web/src/app/routes/_authenticated.admin._enrolled.tsx`
- Modify: `frontend/web/src/shared/ui/AppShell.tsx`
- Modify: `frontend/web/src/shared/ui/AppShell.test.tsx`

**Interfaces:**

- Produces: ADMIN learner access, shell identity/role/portal link, deterministic
  root redirect
- Consumes: current session role/email과 existing route guards

- [ ] **Step 1: guard/root RED tests 작성**

anonymous `/`→`/login`, LEARNER→`/learn`, ADMIN→`/admin`; ADMIN은 learner
portal guard를 통과한다. TOTP enrollment redirect는 existing admin guard가
계속 소유한다.

- [ ] **Step 2: shell RED component tests 작성**

두 shell은 email과 role을 표시하고 ADMIN에게 반대 portal link를 보인다.
LEARNER에게 관리 link가 없어야 한다.

- [ ] **Step 3: RED 확인**

Run:

```bash
pnpm --filter @flex-thia/web exec vitest run src/app/routing/guards.test.ts src/shared/ui/AppShell.test.tsx
```

- [ ] **Step 4: 최소 guard/root/shell 구현**

새 localStorage나 last-portal state를 만들지 않는다. backend role guard는
이미 ADMIN≥LEARNER이므로 변경하지 않는다.

- [ ] **Step 5: GREEN과 commit**

Run focused route/component tests와 web architecture/typecheck. Commit:

```text
feat(web): add admin learner portal switching
```

### Task 5: 어휘 목록 filter·pagination과 상세 학습 정보

**Files:**

- Modify: `frontend/web/src/pages/vocabulary-list/model/vocabularyListSearch.ts`
- Modify: corresponding model test
- Modify: `frontend/web/src/pages/vocabulary-list/api/**`
- Modify: `frontend/web/src/pages/vocabulary-list/ui/VocabularyListPageContainer.tsx`
- Modify: `frontend/web/src/pages/vocabulary-list/ui/VocabularyListPageView.tsx`
- Modify: colocated component tests
- Modify: `frontend/web/src/pages/vocabulary-detail/ui/VocabularyDetailPageView.tsx`
- Modify: colocated detail tests

**Interfaces:**

- Consumes: `vocabularyListQuerySchema`의 query/kind/partOfSpeech/difficulty/page/pageSize
- Produces: URL search와 일치하는 controls/pagination, complete detail projection

- [ ] **Step 1: list model/view RED tests 작성**

filter change는 page를 1로 reset하고 page 이동은 다른 filter를 보존한다.
kind, 품사, 난이도 control과 이전/다음 disabled state를 accessible role로
검증한다.

- [ ] **Step 2: detail RED tests 작성**

kind, difficulty, tone marks, meaning별 연결 pronunciation/audio를
literal fixture로 검증한다. 누락 audio는 재생 button 대신 상태 문구를
보여야 한다.

- [ ] **Step 3: RED 확인과 구현**

Run focused tests, 기존 shared UI primitive로 최소 구현, query contract에
없는 sort/topic filter는 추가하지 않는다.

- [ ] **Step 4: GREEN과 commit**

Run focused tests, architecture/typecheck. Commit:

```text
feat(learning): expose vocabulary study filters
```

### Task 6: 학습자·관리자 home의 누락된 실제 상태

**Files:**

- Modify: `frontend/web/src/pages/learner-home/ui/**`
- Modify: learner home tests
- Modify: `shared/contracts/src/recommendations/**`
- Modify: recommendation contract specs
- Modify: existing learner recommendation query/API and their specs
- Modify: `backend/database/src/queries`의 admin home projection owner
- Modify: corresponding query spec
- Modify: `backend/api/src/operations` 또는 existing admin home owner
- Modify: corresponding API/Swagger specs
- Modify: `frontend/web/src/pages/admin-home/api/adminHomeQueries.ts`
- Modify: admin home container/view/tests

**Interfaces:**

- Produces: 오늘 게시·NEW learner sections와 quick links,
  admin feedback/vocabulary-candidate/TTS/cost/MFA cards
- Consumes: existing recommendations와 Task 3 vocabulary candidate API

- [ ] **Step 1: learner home RED tests 작성**

추천 목록을 유지하면서 `publishedToday`와 최근 게시 `newContent`가
publishedAt 기준으로 정확히 분리되고 문제, 어휘, 단어장, 연습 quick
link 네 개가 각 실제 route로 이동하는지 검증한다.

- [ ] **Step 2: admin projection RED tests 작성**

pending error reports, pending question/vocabulary candidates, failed/running
content/TTS, usage-cost warning과 current MFA enrollment/recent verification
상태를 safe aggregate로 반환한다.

- [ ] **Step 3: RED 확인과 backend projection 구현**

숫자를 frontend에서 여러 page를 합쳐 추측하지 않고 DB query에서
filter/count한다. learner recommendation response에는 공개된 오늘 게시
목록과 NEW 목록을 추가하고, admin controller는 ADMIN+MFA와 Swagger
metadata를 유지한다.

- [ ] **Step 4: home UI 구현**

각 card와 learner section에 independent loading/error/empty state와 실제
detail route를 둔다. 오늘 기준은 server timezone의 날짜 경계를 query가
계산하고 frontend가 client 시각으로 재분류하지 않는다.

- [ ] **Step 5: GREEN과 commit**

Run focused database/API/web tests/typechecks. Commit:

```text
feat(home): surface learning and operations entry points
```

### Task 7: 실제 문제 preview·version 비교·TTS 재생성

**Files:**

- Modify: `shared/contracts/src/admin/questions.ts`
- Modify: corresponding contract specs
- Modify: `backend/database/src/queries/drizzle-admin-question.query.ts`
- Modify: corresponding query specs
- Create: `backend/domain/src/media/question-tts-regeneration.ts`
- Create: corresponding domain spec
- Modify: `backend/database/src/repositories/content-production/drizzle-generated-question-tts.scheduler.ts`
- Modify: corresponding scheduler spec
- Modify: existing admin question controller/service/DTO/specs
- Modify: `frontend/web/src/pages/admin-question-detail/ui/**`
- Modify: admin question detail API/container/model/tests
- Create or modify: structured question version editor feature와 tests

**Interfaces:**

- Produces: resolved question version preview, structural/content diff,
  `POST /admin/questions/:questionId/versions/:versionId/tts-jobs`
- Consumes: sentence/choice/explanation graph, READY media projection,
  existing TTS scheduler/outbox

- [ ] **Step 1: preview contract/query RED tests 작성**

각 version response가 Thai text, Korean translation, pronunciationKo,
tone marks, audio status/read URL, choice/correct answer/explanation을
포함하고 정답은 관리자 응답에만 존재하는지 검증한다.

- [ ] **Step 2: version TTS command RED tests 작성**

현재 version의 required sentence만 schedule하고 READY reusable asset은
새 synthesis를 만들지 않는다. 같은 request ID replay는 같은 job,
진행 중 duplicate는 409, audit/outbox는 transaction으로 함께 기록한다.

- [ ] **Step 3: RED 확인과 backend 구현**

Run contracts/domain/database/API focused tests. 기존 publication query와
scheduler의 rule을 복제하지 말고 공개 port를 재사용한다.

- [ ] **Step 4: preview/diff/TTS UI RED tests 작성**

관리자가 version 두 개를 선택하면 본문·보기·정답·해설·상태 차이가
표시되고, 실제 문제 풀이 형태 preview가 keyboard로 동작해야 한다.
문장·보기·정답·해설의 구조화 편집 form은 기존 replace command payload를
만들고 validation path를 각 field에 표시한다. TTS action은 mutation 중
disabled, 409 시 readiness refresh, 성공 시 job detail link를 제공한다.

- [ ] **Step 5: frontend 구현과 GREEN**

raw JSON replacement은 고급 편집 fallback으로 유지하되 기본 편집,
preview와 diff는 구조화 UI로 제공한다. audio failure는 item retry와
version regeneration을 구분한다.

- [ ] **Step 6: branch verification과 commit**

Run:

```bash
pnpm --filter @flex-thia/contracts test
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/api test
pnpm --filter @flex-thia/web test
pnpm --filter @flex-thia/api typecheck
pnpm --filter @flex-thia/web typecheck
pnpm --filter @flex-thia/web architecture:check
pnpm swagger
```

Commit:

```text
feat(admin): complete question inspection workflow
```
