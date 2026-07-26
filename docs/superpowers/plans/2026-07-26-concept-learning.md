# Concept Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 태국 문자·발음과 문법 개념을 블록형 불변 버전으로 작성·검증·게시하고, 학습자가 게시된 개념을 카드 목록과 상호작용 가능한 상세 화면에서 읽게 한다.

**Architecture:** `concepts` 전용 계약, 도메인, schema, repository/query, API module과 네 page slice를 수직으로 추가한다. 초안 전체 교체는 revision 기반 낙관적 잠금을 사용하고, 외부 검증은 port로 격리하며, 게시 transaction은 이전 버전 은퇴·현재 버전 교체·문장 버전 동결·감사 기록을 함께 처리한다. 공용 index, app module, migration, route와 navigation은 기능 브랜치에서 수정하지 않고 통합 담당자가 한 번에 조립한다.

**Tech Stack:** TypeScript, Zod, NestJS, Drizzle ORM, PostgreSQL, React, TanStack Router/Query, shadcn/ui, Vitest, Testing Library

## Global Constraints

- 먼저 `docs/superpowers/specs/2026-07-26-concept-learning-design.md`를 읽고 그 범위를 벗어나지 않는다.
- 새 파일과 export는 `conventions/comment-convention.md`를 따르고, 테스트 설명은 한국어로 쓴다.
- 구조·컴포넌트·백엔드 의존성 규칙을 지키며 Playwright/API E2E를 추가하지 않는다.
- 기능 브랜치 소유 경로는 `backend/domain/src/concepts/**`, `backend/api/src/concepts/**`, `backend/database/src/schema/concepts.schema.*`, `backend/database/src/repositories/drizzle-concept*`, `backend/database/src/queries/drizzle-concept*`, `shared/contracts/src/concepts/**`, 네 concept page slice뿐이다.
- `app.module.ts`, schema root `index.ts`, global OpenAPI DTO/spec, `backend/database/drizzle/**`, migration meta, app route, `routeTree.gen.ts`, navigation, seed/reset은 통합 담당자만 수정한다.
- contracts/domain/database package root `index.ts`는 독립 typecheck에 필요한 자기 기능 export만 마지막 단독 commit으로 추가한다.
- 다른 query의 private mapper는 import하지 않는다. 공개 `publicThaiSentenceSchema`와 `InteractiveThaiSentence`만 재사용한다.
- 편집기는 기존 `thai_sentence_versions` ID만 참조한다. 문장·AI·TTS provider는 만들지 않는다.
- production `ConceptContentValidator`가 없으면 게시 조립은 fail-closed한다. deterministic fake는 단위 테스트에서만 쓴다.
- 목차는 블록 제목에서 파생하고, 개념당 초안은 최대 하나이며 게시·은퇴 버전은 불변이다.

---

### Task 1: 개념 공개·관리 계약

**Files:**
- Create: `shared/contracts/src/concepts/concepts.ts`
- Create: `shared/contracts/src/concepts/concepts.spec.ts`
- Create: `shared/contracts/src/concepts/index.ts`

**Interfaces:**

```ts
export const conceptCategorySchema = z.enum([
  'THAI_SCRIPT_PRONUNCIATION',
  'GRAMMAR',
]);
export const conceptStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']);
export const conceptVersionStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']);
export const conceptValidationStatusSchema = z.enum(['PENDING', 'PASSED', 'FAILED']);

export const conceptBlockInputSchema = z.discriminatedUnion('kind', [
  explanationBlockInputSchema, // position, heading, paragraphs
  ruleTableBlockInputSchema,   // position, heading, headers, rows
  thaiExamplesBlockInputSchema,// position, heading, examples
]);
export const createConceptRequestSchema = z.object({
  category: conceptCategorySchema,
  position: z.int().nonnegative(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  blocks: z.array(conceptBlockInputSchema).min(1),
}).strict();
export const replaceConceptVersionRequestSchema =
  createConceptRequestSchema.extend({ revision: z.int().nonnegative() }).strict();
```

`THAI_EXAMPLES` 입력 원소는 `{ position, sentenceVersionId, noteKo }`,
공개 원소는 `{ position, noteKo, sentence: publicThaiSentenceSchema }`다.

- [ ] **RED:** strict unknown field, 표 열 수 불일치, 내부 media key 공개를 거부하고 canonical 세 블록과 validation issue `{ source, path, code, evidenceKo }`를 수락하는 테스트를 쓴다.
- [ ] Run: `pnpm exec vitest run shared/contracts/src/concepts/concepts.spec.ts` → missing module/export로 FAIL.
- [ ] **GREEN:** learner list/detail, admin create/replace/list/detail/validation strict schemas와 inferred type을 구현한다. learner list query는 `category`, admin list는 `category/status/page/pageSize`만 허용한다.
- [ ] Run: `pnpm exec vitest run shared/contracts/src/concepts/concepts.spec.ts && pnpm --filter @flex-thia/contracts typecheck` → PASS.
- [ ] Commit: `git add shared/contracts/src/concepts && git commit -m "feat(concepts): define concept contracts"`

### Task 2: 개념 도메인 모델과 상태 전이

**Files:**
- Create: `backend/domain/src/concepts/concept.ts`
- Create: `backend/domain/src/concepts/concept.spec.ts`
- Create: `backend/domain/src/concepts/concept.repository.ts`
- Create: `backend/domain/src/concepts/concept-content.validator.ts`
- Create: `backend/domain/src/concepts/concept.service.ts`
- Create: `backend/domain/src/concepts/concept.service.spec.ts`
- Create: `backend/domain/src/concepts/index.ts`

**Interfaces:**

```ts
export interface ConceptValidationIssue {
  source: 'STRUCTURE' | 'REFERENCE' | 'EXTERNAL';
  path: string;
  code: string;
  evidenceKo: string;
}
export interface ConceptContentValidator {
  validate(input: ConceptValidationCandidate): Promise<ConceptValidationIssue[]>;
}
export interface ConceptAdminRepository {
  createConcept(input: CreateConceptCommand, context: ConceptCommandContext):
    Promise<ConceptDraftRecord>;
  createNextDraft(conceptId: string, context: ConceptCommandContext):
    Promise<ConceptDraftRecord>;
  replaceDraft(versionId: string, input: ReplaceConceptDraftCommand,
    context: ConceptCommandContext): Promise<ConceptDraftRecord>;
  loadValidationCandidate(versionId: string):
    Promise<ConceptValidationCandidate | null>;
  saveValidation(input: { versionId: string; expectedRevision: number;
    issues: ConceptValidationIssue[]; validatedAt: Date },
    context: ConceptCommandContext): Promise<ConceptValidationReport>;
  publish(input: { versionId: string; expectedRevision: number },
    context: ConceptCommandContext): Promise<void>;
  hide(conceptId: string, context: ConceptCommandContext): Promise<void>;
  restore(conceptId: string, context: ConceptCommandContext): Promise<void>;
}
```

`ConceptValidationCandidate`의 example은 `sentenceExists`,
`audioAssetExists`, `audioAssetStatus`를 포함한다.

- [ ] **RED:** 연속 position, 표 열 수, 예시 중복, 문장/READY 음성 참조, 외부 issue 합성, 검증 중 revision 충돌, 같은 revision의 PASSED 게시, 불변 버전, hide/restore 전이를 테스트한다.
- [ ] Run: `pnpm exec vitest run backend/domain/src/concepts` → FAIL.
- [ ] **GREEN:** 순수 구조/reference 검증과 service orchestration을 구현한다. 구조/reference가 통과할 때만 외부 validator를 호출하고 캡처한 revision으로 결과를 저장한다.
- [ ] 오류 코드는 `CONCEPT_NOT_FOUND`, `CONCEPT_VERSION_NOT_FOUND`, `CONCEPT_DRAFT_ALREADY_EXISTS`, `CONCEPT_VERSION_IMMUTABLE`, `CONCEPT_REVISION_CONFLICT`, `CONCEPT_VALIDATION_REQUIRED`, `CONCEPT_INVALID_TRANSITION`, `CONCEPT_REFERENCE_NOT_FOUND`, `CONCEPT_PERSISTENCE_CONFLICT`로 고정한다.
- [ ] Run: `pnpm exec vitest run backend/domain/src/concepts && pnpm --filter @flex-thia/domain typecheck` → PASS.
- [ ] Commit: `git add backend/domain/src/concepts && git commit -m "feat(concepts): implement concept lifecycle"`

### Task 3: 개념 전용 Drizzle schema

**Files:**
- Create: `backend/database/src/schema/concepts.schema.ts`
- Create: `backend/database/src/schema/concepts.schema.spec.ts`

**Produces:** `concepts`, `conceptVersions`, `conceptBlocks`,
`conceptBlockExamples`; examples는 `thaiSentenceVersions`를 참조한다.

- [ ] **RED:** `(concept_id, version)` unique, 개념별 DRAFT partial unique, version/block별 position unique, enum 값, nullable current version, sentence version FK를 검증한다.
- [ ] Run: `pnpm exec vitest run backend/database/src/schema/concepts.schema.spec.ts` → FAIL.
- [ ] **GREEN:** 네 table을 구현한다. JSONB는 validation issues, paragraphs, table headers/rows에만 쓰고 block payload 조합은 domain/repository에서 검증한다.
- [ ] Run: `pnpm exec vitest run backend/database/src/schema/concepts.schema.spec.ts` → PASS.
- [ ] Run: `pnpm --filter @flex-thia/database typecheck`; 공용 schema index 미연결 diagnostic만 handoff하고 index는 수정하지 않는다.
- [ ] Commit: `git add backend/database/src/schema/concepts.schema.ts backend/database/src/schema/concepts.schema.spec.ts && git commit -m "feat(concepts): add concept schema"`

### Task 4: 관리자 concept transaction repository

**Files:**
- Create: `backend/database/src/repositories/drizzle-concept-admin.repository.ts`
- Create: `backend/database/src/repositories/drizzle-concept-admin.repository.spec.ts`

**Implements:** `ConceptAdminRepository`; Task 3 tables, sentence versions,
media assets, audit logs를 사용한다.

- [ ] **RED:** create의 한 transaction 저장, next draft 복제/번호 증가, 단일 draft 충돌, `id + DRAFT + expectedRevision` 교체, validation 저장, publish의 retire/current/freeze, hide/restore, audit와 rollback을 테스트한다.
- [ ] Run: `pnpm exec vitest run backend/database/src/repositories/drizzle-concept-admin.repository.spec.ts` → FAIL.
- [ ] **GREEN:** repository를 구현한다. 외부 검증은 transaction 밖에서 끝나며 repository는 결과만 저장한다. publish freeze 조건은 기존 질문 규칙을 따르되 private 함수를 import하지 않는다.
- [ ] 영향 행이 0이면 재조회해 revision/immutable/transition/persistence conflict를 구분한다.
- [ ] Run: `pnpm exec vitest run backend/database/src/repositories/drizzle-concept-admin.repository.spec.ts` → PASS.
- [ ] Commit: `git add backend/database/src/repositories/drizzle-concept-admin.repository* && git commit -m "feat(concepts): persist concept lifecycle"`

### Task 5: 학습자·관리자 concept read query

**Files:**
- Create: `backend/database/src/queries/drizzle-learner-concept.query.ts`
- Create: `backend/database/src/queries/drizzle-learner-concept.query.spec.ts`
- Create: `backend/database/src/queries/drizzle-admin-concept.query.ts`
- Create: `backend/database/src/queries/drizzle-admin-concept.query.spec.ts`

**Interfaces:**

```ts
export interface LearnerConceptQuery {
  list(category: ConceptCategory): Promise<LearnerConceptListRow[]>;
  findPublishedDetail(conceptId: string): Promise<LearnerConceptDetailRow | null>;
}
export interface AdminConceptQuery {
  list(input: AdminConceptListFilter): Promise<AdminConceptListResult>;
  findDetail(conceptId: string): Promise<AdminConceptDetailRow | null>;
}
```

learner example sentence projection은 signed URL이 아닌 sentence/token/
expression media storage key를 가진다.

- [ ] **RED:** logical/current version 모두 PUBLISHED인 공개 필터, hidden/stale 제외, `position/title/id` 정렬, nested position 정렬, admin 모든 상태/버전, pagination total을 테스트한다.
- [ ] Run: `pnpm exec vitest run backend/database/src/queries/drizzle-learner-concept.query.spec.ts backend/database/src/queries/drizzle-admin-concept.query.spec.ts` → FAIL.
- [ ] **GREEN:** N+1 없이 flat rows를 읽고 concept 전용 순수 mapper로 graph를 조립한다.
- [ ] 같은 명령 재실행 → PASS.
- [ ] Commit: `git add backend/database/src/queries/drizzle-learner-concept.query* backend/database/src/queries/drizzle-admin-concept.query* && git commit -m "feat(concepts): query concept projections"`

### Task 6: Concept 전용 NestJS HTTP module

**Files:**
- Create: `backend/api/src/concepts/concepts.dto.ts`
- Create: `backend/api/src/concepts/concepts.service.ts`
- Create: `backend/api/src/concepts/concepts.service.spec.ts`
- Create: `backend/api/src/concepts/learner-concepts.controller.ts`
- Create: `backend/api/src/concepts/learner-concepts.controller.spec.ts`
- Create: `backend/api/src/concepts/admin-concepts.controller.ts`
- Create: `backend/api/src/concepts/admin-concepts.controller.spec.ts`
- Create: `backend/api/src/concepts/concepts.module.ts`
- Create: `backend/api/src/concepts/concepts.module.spec.ts`
- Create: `backend/api/src/concepts/index.ts`

**Interfaces:**

```ts
export interface ConceptsModuleOptions {
  learnerQuery: LearnerConceptQuery;
  adminQuery: AdminConceptQuery;
  adminService: ConceptService;
  mediaReadUrls: MediaReadUrlProvider;
  users: IdentityUserRepository;
  authorizer: AuthorizerGuardOptions;
}
```

`concepts.dto.ts`는 Task 1 schema로 module-local `createZodDto` class를
만들며 global OpenAPI DTO를 수정하지 않는다.

- [ ] **RED:** learner response parsing, 모든 sentence/token/expression media key 서명·비노출, 404 은닉, admin 9개 operation/status, ADMIN+TOTP metadata, domain 오류 매핑, module 조립을 테스트한다.
- [ ] Run: `pnpm exec vitest run backend/api/src/concepts` → FAIL.
- [ ] **GREEN:** 설계 문서 경로 그대로 service/controller/module을 구현한다. 생성·복제·교체는 version response, validate는 report, publish/hide/restore는 204다.
- [ ] Run: `pnpm exec vitest run backend/api/src/concepts` → PASS.
- [ ] Run: `pnpm --filter @flex-thia/api typecheck`; root export/app module 미연결 diagnostic만 기록하고 공통 파일은 수정하지 않는다.
- [ ] Commit: `git add backend/api/src/concepts && git commit -m "feat(concepts): expose concept APIs"`

### Task 7: 학습자 개념 카드 홈과 상세

**Files:**
- Create: `frontend/web/src/pages/concept-list/api/conceptQueries.ts`
- Create: `frontend/web/src/pages/concept-list/ui/ConceptListPageContainer.tsx`
- Create: `frontend/web/src/pages/concept-list/ui/ConceptListPageView.tsx`
- Create: `frontend/web/src/pages/concept-list/ui/ConceptListPage.test.tsx`
- Create: `frontend/web/src/pages/concept-list/index.ts`
- Create: `frontend/web/src/pages/concept-detail/api/conceptDetailQueries.ts`
- Create: `frontend/web/src/pages/concept-detail/ui/ConceptDetailPageContainer.tsx`
- Create: `frontend/web/src/pages/concept-detail/ui/ConceptDetailPageView.tsx`
- Create: `frontend/web/src/pages/concept-detail/ui/ConceptDetailPage.test.tsx`
- Create: `frontend/web/src/pages/concept-detail/index.ts`

- [ ] **RED:** 두 category tab/query key, loading/error-retry/empty/cards, 상세 TOC anchor, paragraph/table, `lang="th"`와 `InteractiveThaiSentence`, 404 구분, response Zod parse를 테스트한다.
- [ ] Run: `pnpm exec vitest run frontend/web/src/pages/concept-list frontend/web/src/pages/concept-detail` → FAIL.
- [ ] **GREEN:** route-agnostic typed props를 받는 두 page slice를 기존 page-state/query 관례로 구현한다. route 파일은 만들지 않는다.
- [ ] Run: `pnpm exec vitest run frontend/web/src/pages/concept-list frontend/web/src/pages/concept-detail && pnpm --filter @flex-thia/web typecheck` → PASS.
- [ ] Commit: `git add frontend/web/src/pages/concept-list frontend/web/src/pages/concept-detail && git commit -m "feat(concepts): add learner concept pages"`

### Task 8: 관리자 개념 목록과 블록 편집 상세

**Files:**
- Create: `frontend/web/src/pages/concept-management/api/adminConceptQueries.ts`
- Create: `frontend/web/src/pages/concept-management/model/adminConceptSearch.ts`
- Create: `frontend/web/src/pages/concept-management/ui/ConceptManagementPageContainer.tsx`
- Create: `frontend/web/src/pages/concept-management/ui/ConceptManagementPageView.tsx`
- Create: `frontend/web/src/pages/concept-management/ui/ConceptManagementPage.test.tsx`
- Create: `frontend/web/src/pages/concept-management/index.ts`
- Create: `frontend/web/src/pages/admin-concept-detail/api/adminConceptDetailQueries.ts`
- Create: `frontend/web/src/pages/admin-concept-detail/api/conceptVersionMutations.ts`
- Create: `frontend/web/src/pages/admin-concept-detail/model/conceptDraftFormSchema.ts`
- Create: `frontend/web/src/pages/admin-concept-detail/ui/AdminConceptDetailPageContainer.tsx`
- Create: `frontend/web/src/pages/admin-concept-detail/ui/AdminConceptDetailPageView.tsx`
- Create: `frontend/web/src/pages/admin-concept-detail/ui/ConceptBlockEditor.tsx`
- Create: `frontend/web/src/pages/admin-concept-detail/ui/AdminConceptDetailPage.test.tsx`
- Create: `frontend/web/src/pages/admin-concept-detail/index.ts`

- [ ] **RED:** filter URL 왕복, 상태/버전/검증 표시, 종류별 block 편집·정렬, raw HTML 부재, sentence UUID+note 입력, revision 저장, 409 재조회 안내, validation issue, PASSED publish, readonly published, hide/restore를 테스트한다.
- [ ] Run: `pnpm exec vitest run frontend/web/src/pages/concept-management frontend/web/src/pages/admin-concept-detail` → FAIL.
- [ ] **GREEN:** 목록/상세와 page-local editor를 구현한다. 한 화면 editor를 feature/shared로 승격하지 않고 client validation이 서버 검증을 대체하지 않게 한다.
- [ ] Run: `pnpm exec vitest run frontend/web/src/pages/concept-management frontend/web/src/pages/admin-concept-detail && pnpm --filter @flex-thia/web typecheck` → PASS.
- [ ] Commit: `git add frontend/web/src/pages/concept-management frontend/web/src/pages/admin-concept-detail && git commit -m "feat(concepts): add concept administration"`

### Task 9: 기능 브랜치 검증과 통합 handoff

- [ ] contracts/domain/database package root `index.ts`에 자기 기능 export만
  추가하고 별도 마지막 commit으로 만든다.
- [ ] `git diff --name-only main...HEAD`로 Global Constraints의 소유 경로만 바뀌었는지 확인한다.
- [ ] 전용 suite를 실행한다.

```bash
pnpm exec vitest run \
  shared/contracts/src/concepts backend/domain/src/concepts \
  backend/database/src/schema/concepts.schema.spec.ts \
  backend/database/src/repositories/drizzle-concept-admin.repository.spec.ts \
  backend/database/src/queries/drizzle-learner-concept.query.spec.ts \
  backend/database/src/queries/drizzle-admin-concept.query.spec.ts \
  backend/api/src/concepts frontend/web/src/pages/concept-list \
  frontend/web/src/pages/concept-detail frontend/web/src/pages/concept-management \
  frontend/web/src/pages/admin-concept-detail
```

- [ ] contracts/domain/database/api/web typecheck와 `pnpm lint`를 실행한다. 기능 test/lint failure는 handoff하지 않는다.
- [ ] 통합 담당자는 root exports와 schema index, 단일 migration/meta, production validator, `ConceptsModule.register`, OpenAPI spec, route/navigation/routeTree, 승인된 본문+READY sentence seed/reset을 추가한다.
- [ ] 통합 담당자는 content feedback이 concept/version/block ID를 소비만 하고 concepts schema를 변경하지 않는지 확인한다.
- [ ] 통합 후 `pnpm test && pnpm typecheck && pnpm lint && pnpm run build`를 모두 통과시킨다. E2E runner는 추가하지 않는다.
