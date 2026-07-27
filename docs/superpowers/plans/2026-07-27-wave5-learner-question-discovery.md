# Wave 5 Learner Question Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학습자가 UUID를 입력하지 않고 대분류·세부 유형·주제·태그·난이도와 학습 상태로 공개 문제를 안정적으로 탐색하게 한다.

**Architecture:** 기존 `GET /api/v1/questions` query/response를 확장해 현재 공개 문제에서 계산한 facet과 각 item의 taxonomy projection을 함께 반환한다. Drizzle query는 `EXISTS` 기반 topic/tag filter와 `publishedAt DESC, questionId DESC` 정렬을 사용한다. 프론트엔드는 같은 URL search contract를 desktop panel과 mobile bottom Sheet에서 공유한다.

**Tech Stack:** TypeScript 6, Zod, Drizzle ORM, NestJS 11, React 19, TanStack Router/Query, Tailwind CSS, Vitest

## Global Constraints

- 코드 기준선은 local `main`의 `e98cba6`이며 승인 설계 `54d25e8`을 포함한 공통 계획 commit에서 branch를 만든다.
- `docs/superpowers/specs/2026-07-27-wave5-parallel-delivery-design.md`를 기능 요구의 단일 기준으로 사용한다.
- `conventions/comment-convention.md`, `conventions/structure-convention.md`,
  `conventions/frontend/component-convention.md`를 따른다.
- 테스트 설명은 한국어로 작성하고 E2E를 추가하지 않는다.
- schema, migration, AppModule, infra, route tree와 신규 package를 수정하지 않는다.
- DRAFT·HIDDEN·INVALIDATED 문제는 item과 facet에서 모두 제외한다.
- 같은 publishedAt에는 questionId DESC를 사용해 stable pagination을 보장한다.
- 기존 저장/첫 결과/difficulty/page filter를 보존한다.

---

## Ownership

**Modify:**

- `shared/contracts/src/learning/questions.ts`
- `shared/contracts/src/learning/questions.spec.ts`
- `backend/database/src/queries/drizzle-learner-question.query.ts`
- `backend/database/src/queries/drizzle-learner-question.query.spec.ts`
- `backend/api/src/learning/learner-content.service.ts`
- `backend/api/src/learning/learner-content.service.spec.ts`
- `backend/api/src/learning/learner-questions.controller.spec.ts`
- `frontend/web/src/pages/question-list/api/**`
- `frontend/web/src/pages/question-list/model/**`
- `frontend/web/src/pages/question-list/ui/**`

**Do not modify:**

- `backend/database/src/schema/**`
- `backend/database/drizzle/**`
- `backend/domain/src/content-production/**`
- `backend/providers/**`
- `backend/worker/**`
- 관리자 question/taxonomy API
- `backend/api/src/app.module.ts`
- `infra/**`
- `frontend/web/src/routeTree.gen.ts`
- package manifests and lockfile

## Fixed contract

```ts
type QuestionMajorCategory =
  | 'LISTENING_RESPONSE'
  | 'LISTENING_DIALOGUE'
  | 'LISTENING_PASSAGE'
  | 'READING_VOCABULARY_GRAMMAR'
  | 'READING_SYNONYM_RELATION'
  | 'READING_ERROR_IDENTIFICATION'
  | 'READING_PASSAGE';

type QuestionListSort = 'LATEST';

interface QuestionListFacets {
  majorCategories: Array<{ value: QuestionMajorCategory; label: string }>;
  questionTypes: Array<{
    id: string;
    slug: string;
    displayName: string;
    majorCategory: QuestionMajorCategory;
  }>;
  topics: Array<{ id: string; slug: string; displayName: string }>;
  tags: Array<{ id: string; slug: string; displayName: string }>;
}
```

### Task 1: Extend the public question contract

**Files:**

- Modify: `shared/contracts/src/learning/questions.ts`
- Test: `shared/contracts/src/learning/questions.spec.ts`

**Interfaces:**

- Consumes: existing question list query/item/page schemas
- Produces: `majorCategory`, `topicId`, `tagId`, `sort`, taxonomy item
  projection and `facets`

- [ ] **Step 1: Write failing query parsing tests**

  ```ts
  expect(
    questionListQuerySchema.parse({
      majorCategory: 'READING_PASSAGE',
      topicId: ids.topic,
      tagId: ids.tag,
      sort: 'LATEST',
    }),
  ).toMatchObject({ sort: 'LATEST' });
  ```

  unknown category/sort, invalid UUID와 unknown key는 reject한다.

- [ ] **Step 2: Write failing response tests**

  item의 major category/topic/tags와 response facets를 요구하고 tags/facets
  unknown key를 reject한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run shared/contracts/src/learning/questions.spec.ts`

- [ ] **Step 4: Implement strict schemas**

  `sort` 기본값은 `LATEST`; 기존 query default/page semantics를 유지한다.
  taxonomy term은 id/slug/displayName만 공개한다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run shared/contracts/src/learning/questions.spec.ts && pnpm --filter @flex-thia/contracts typecheck`

  Commit:
  `git commit -m "feat(contracts): extend question discovery"`

### Task 2: Extend query projections and filters

**Files:**

- Modify: `backend/database/src/queries/drizzle-learner-question.query.ts`
- Test: `backend/database/src/queries/drizzle-learner-question.query.spec.ts`

**Interfaces:**

- Consumes:

```ts
interface LearnerQuestionListQuery {
  skill?: LearnerQuestionSkill;
  majorCategory?: QuestionMajorCategory;
  questionTypeId?: string;
  topicId?: string;
  tagId?: string;
  difficulty?: number;
  saved?: boolean;
  firstResult?: LearnerQuestionFirstResult;
  sort: 'LATEST';
  page: number;
  pageSize: number;
}
```

- Produces: expanded `LearnerQuestionListProjection`

- [ ] **Step 1: Write failing SQL shape tests**

  type/topic joins, tag `EXISTS`, current PUBLISHED version only,
  `published_at DESC, question_id DESC`, count distinct 또는 non-multiplying
  predicate를 검증한다.

- [ ] **Step 2: Write failing projection tests**

  item의 type/category/topic/tags stable order와 page metadata를 검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/queries/drizzle-learner-question.query.spec.ts`

- [ ] **Step 4: Implement filter query**

  tag filter는 outer item row를 늘리는 join 대신 correlated `EXISTS`를
  사용한다. item tags는 page IDs를 얻은 뒤 두 번째 batch query로 읽고
  slug/id stable order로 묶는다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/database/src/queries/drizzle-learner-question.query.spec.ts && pnpm --filter @flex-thia/database typecheck`

  Commit:
  `git commit -m "feat(database): filter learner questions by taxonomy"`

### Task 3: Derive stable public facets

**Files:**

- Modify: `backend/database/src/queries/drizzle-learner-question.query.ts`
- Test: `backend/database/src/queries/drizzle-learner-question.query.spec.ts`

**Interfaces:**

- Produces:

```ts
function listQuestionFacets(): Promise<QuestionListFacets>;
```

- [ ] **Step 1: Write failing facet tests**

  전체 공개 current versions에서만 실제 사용되는 category/type/topic/tag를
  distinct로 반환하고 DRAFT/HIDDEN/INVALIDATED 근거를 제외하는지 검증한다.

- [ ] **Step 2: Add stable order tests**

  category enum order, type displayName/id, topic/tag displayName/id 순서를
  고정한다. 현재 item filters는 facet 결과를 줄이지 않아야 한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/queries/drizzle-learner-question.query.spec.ts`

- [ ] **Step 4: Implement facet query**

  facet query는 현재 공개 문제 ID CTE를 공통 근거로 사용하고 각 taxonomy
  table을 distinct 조회한다.

- [ ] **Step 5: Extend the gated PostgreSQL cases**

  같은 `drizzle-learner-question.query.spec.ts`의
  `LEARNER_QUESTION_QUERY_TEST_DATABASE_URL` suite에 topic/tag 중복 없는
  count, DRAFT/HIDDEN/INVALIDATED facet 제외와 same-time stable pagination
  fixture를 추가한다. feature branch에서는 환경이 없으면 skip하고 integration
  branch가 실제 PostgreSQL에서 실행한다.

- [ ] **Step 6: Verify and commit**

  Run:
  `pnpm exec vitest run backend/database/src/queries/drizzle-learner-question.query.spec.ts`

  Commit:
  `git commit -m "feat(database): expose learner question facets"`

### Task 4: API mapping

**Files:**

- Modify: `backend/api/src/learning/learner-content.service.ts`
- Test: `backend/api/src/learning/learner-content.service.spec.ts`
- Test: `backend/api/src/learning/learner-questions.controller.spec.ts`

**Interfaces:**

- Consumes: expanded shared query and DB projection
- Produces: expanded `GET /api/v1/questions` response

- [ ] **Step 1: Write failing service tests**

  모든 query field를 DB query로 전달하고 item/facets를 shared response
  schema와 같은 모양으로 serialize하는지 검증한다.

- [ ] **Step 2: Write failing controller tests**

  default `sort=LATEST`, invalid category/UUID 400와 기존 authenticated
  metadata를 검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/api/src/learning/learner-content.service.spec.ts backend/api/src/learning/learner-questions.controller.spec.ts`

- [ ] **Step 4: Implement mapper**

  API service는 labels를 재해석하지 않고 DB projection을 명시적으로
  serialize한다. response schema parse를 경계에서 유지한다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/api/src/learning/learner-content.service.spec.ts backend/api/src/learning/learner-questions.controller.spec.ts && pnpm --filter @flex-thia/api typecheck`

  Commit:
  `git commit -m "feat(api): map learner question discovery"`

### Task 5: URL search model

**Files:**

- Modify: `frontend/web/src/pages/question-list/model/questionListSearch.ts`
- Create or modify test next to model

**Interfaces:**

- Produces:

```ts
interface QuestionListSearch {
  skill?: 'READING' | 'LISTENING';
  majorCategory?: QuestionMajorCategory;
  questionTypeId?: string;
  topicId?: string;
  tagId?: string;
  difficulty?: number;
  saved?: boolean;
  firstResult?: 'CORRECT' | 'INCORRECT' | 'UNANSWERED';
  sort?: 'LATEST';
  page?: number;
}
```

- [ ] **Step 1: Write failing round-trip tests**

  parse → request query → route search에서 모든 field를 보존하고 invalid
  values를 reject하는지 검증한다.

- [ ] **Step 2: Add page-reset helper test**

  filter patch가 적용되면 page를 `undefined`로 만들고 page-only patch는
  filters를 유지하는 `applyQuestionFilterPatch`를 고정한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run frontend/web/src/pages/question-list/model`

- [ ] **Step 4: Implement search model**

  shared query schema를 재사용하고 빈 string을 undefined로 정규화한다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run frontend/web/src/pages/question-list/model && pnpm --filter @flex-thia/web typecheck`

  Commit:
  `git commit -m "feat(web): model question discovery search"`

### Task 6: Label-based filter UI

**Files:**

- Modify: `frontend/web/src/pages/question-list/ui/QuestionFilters.tsx`
- Modify: `frontend/web/src/pages/question-list/ui/QuestionListPageView.tsx`
- Test: `frontend/web/src/pages/question-list/ui/QuestionListPage.test.tsx`

**Interfaces:**

- Consumes: `QuestionListFacets`, `QuestionListSearch`
- Produces: one controlled filter form reused in desktop/mobile shells

- [ ] **Step 1: Write failing interaction tests**

  UUID input이 없고 label select로 category/type/topic/tag를 선택하는지,
  category 변경 시 호환되지 않는 type을 해제하는지, filter 변경 시 page
  1로 돌아가는지 검증한다.

- [ ] **Step 2: Add desktop/mobile tests**

  desktop filter panel과 mobile `Sheet side="bottom"`가 같은 callbacks와
  accessible labels를 사용하는지 검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run frontend/web/src/pages/question-list/ui/QuestionListPage.test.tsx`

- [ ] **Step 4: Implement filters**

  기존 shared Select/Sheet/Button을 사용한다. category에 맞는 type options만
  보이고 facet이 비어 있으면 disabled empty copy를 표시한다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run frontend/web/src/pages/question-list/ui/QuestionListPage.test.tsx && pnpm --filter @flex-thia/web architecture:check && pnpm --filter @flex-thia/web typecheck`

  Commit:
  `git commit -m "feat(web): add taxonomy question filters"`

### Task 7: Taxonomy-rich question cards and pagination

**Files:**

- Modify: `frontend/web/src/pages/question-list/ui/QuestionListPageView.tsx`
- Modify: question list container/API query files
- Test: `frontend/web/src/pages/question-list/ui/QuestionListPage.test.tsx`

**Interfaces:**

- Consumes: expanded list response
- Preserves: query key includes complete search object

- [ ] **Step 1: Write failing render tests**

  카드에 대분류·세부유형·주제·태그·난이도를 표시하고 tags가 0개일 때
  불필요한 빈 container를 만들지 않는지 검증한다.

- [ ] **Step 2: Write pagination/query-key tests**

  next/previous가 filters를 유지하고, facet/filter 변경이 TanStack Query
  key를 바꾸며, empty/error/retry state가 기존처럼 동작하는지 검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run frontend/web/src/pages/question-list`

- [ ] **Step 4: Implement cards and query integration**

  semantic color token과 existing Card/Badge/Button을 사용하고 raw UUID를
  사용자 copy로 표시하지 않는다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run frontend/web/src/pages/question-list && pnpm --filter @flex-thia/web typecheck`

  Commit:
  `git commit -m "feat(web): present question taxonomy facets"`

### Task 8: Branch-wide verification and cleanup

**Files:**

- Review all owned contract/query/API/page files

- [ ] **Step 1: Run focused suites**

  Run:
  `pnpm exec vitest run shared/contracts/src/learning/questions.spec.ts backend/database/src/queries/drizzle-learner-question.query.spec.ts backend/api/src/learning/learner-content.service.spec.ts backend/api/src/learning/learner-questions.controller.spec.ts frontend/web/src/pages/question-list`

- [ ] **Step 2: Run workspace gates**

  Run:
  `pnpm structure:check && pnpm format:check && pnpm --filter @flex-thia/web architecture:check && pnpm lint && pnpm --filter @flex-thia/contracts typecheck && pnpm --filter @flex-thia/database typecheck && pnpm --filter @flex-thia/api typecheck && pnpm --filter @flex-thia/web typecheck && pnpm --filter @flex-thia/web build`

- [ ] **Step 3: Check diff**

  Run:
  `git diff --check && git status --short`

  Expected: schema/migration/infra/route tree/package 변경이 없다.

- [ ] **Step 4: Clean generated artifacts**

  Remove only branch-local `dist`, `coverage`, `.vite`, `cdk.out`; preserve
  dependency caches and DB volume.

- [ ] **Step 5: Final commit if needed**

  `git commit -m "test(web): harden learner question discovery"`
