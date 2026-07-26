# Wave 4 Question Taxonomy Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax so progress can be tracked.

**Goal:** FLEX 7대 분류 아래에서 세부 문제 유형의 불변 버전, 난이도 기준, 주제·태그, 승인 예시를 관리하고 실제 문제 버전이 그 설정을 참조하도록 관리자 설정 기능을 완성한다.

**Architecture:** `questions` 모듈이 taxonomy의 유일한 소유자다. 고정된 7대 분류는 enum, 관리자가 만드는 세부 유형은 논리 엔티티, 템플릿·선택지 수·판정 규칙·난이도 기준은 불변 유형 버전에 둔다. 설정용 승인 예시는 일반 문제 생성과 분리된 canonical JSON snapshot으로 저장하여 “활성 유형이 있어야 문제를 만들고, 문제가 있어야 유형을 활성화하는” 순환을 끊는다. 일반 문제 작성은 `ACTIVE` 유형 버전만 선택하지만, 기존 문제 버전이 참조하는 `RETIRED` 유형 버전은 삭제하지 않고 조회·검증할 수 있다.

**Tech Stack:** TypeScript, NestJS, Drizzle ORM, PostgreSQL 16, Zod/OpenAPI, React, TanStack Router/Query, Vitest.

## Global Constraints

- 기준 문서는 `docs/superpowers/specs/2026-07-16-thai-flex-learning-service-design.md`의 8장과 `docs/superpowers/specs/2026-07-26-full-product-parallel-delivery-design.md`의 Wave 4다.
- 대분류 코드는 `LISTENING_RESPONSE`, `LISTENING_DIALOGUE`, `LISTENING_PASSAGE`, `READING_VOCABULARY_GRAMMAR`, `READING_SYNONYM_RELATION`, `READING_ERROR_IDENTIFICATION`, `READING_PASSAGE`의 7개로 고정한다.
- 템플릿은 기존 `STANDARD_CHOICE`, `PASSAGE_CHOICE`, `DIALOGUE_CHOICE`, `INLINE_SPAN_CHOICE`만 사용한다. 새로운 상호작용 템플릿은 이 계획의 범위가 아니다.
- 기존 `question_versions.difficulty`의 1~5 값을 그대로 보존한다. 유형 버전 활성화에는 1~5 각 단계의 한국어 기준 문구가 모두 필요하다.
- 유형 버전 상태는 `DRAFT → ACTIVE → RETIRED`다. 활성화 뒤 내용 수정·삭제는 금지하고 새 버전을 만든다.
- 유형당 `ACTIVE` 버전은 최대 하나다. 새 버전 활성화 트랜잭션에서 이전 `ACTIVE`를 `RETIRED`로 전환한다.
- 승인 예시는 `AdminQuestionVersionPayload`와 동일한 블록·선택지 구조를 가진 snapshot이다. 문제·문제 버전 FK는 두지 않으며, DRAFT 유형 버전에서만 추가/삭제할 수 있다. 활성화에는 구조 검증을 통과한 예시가 1개 이상 필요하다.
- 주제와 태그의 slug/displayName은 생성 후 불변이고 `ACTIVE/ARCHIVED`만 변경한다. 문제 분류는 논리 문제가 아니라 `question_versions`에 연결하여 과거 버전의 참조를 보존한다.
- 질문 생성·교체·content import에서 topic은 필수다. 기존 호출 호환을 위해 계약 parser의 입력 default는 `general`, tags는 `[]`로 두되 domain에는 정규화된 값만 전달한다.
- `question_versions.type_version_id`의 `ON DELETE RESTRICT`를 유지하고, taxonomy의 모든 참조 FK도 `RESTRICT`를 사용한다.
- E2E 스펙은 추가하지 않는다. controller/component 단위 테스트, lint, typecheck, build, 실제 PostgreSQL migration/seed 검증으로 끝낸다.
- 새 파일 헤더와 변경 export의 JSDoc은 `conventions/comment-convention.md`, 위치와 의존 방향은 `conventions/structure-convention.md`, UI는 `conventions/frontend/component-convention.md`를 따른다. Vitest/Jest 설명은 한국어로 쓴다.

## Ownership And Merge Boundaries

이 작업 브랜치가 소유하는 경로:

- `shared/contracts/src/questions/question-taxonomy-settings.ts`
- `backend/domain/src/questions/question-taxonomy*.ts`
- `backend/database/src/repositories/drizzle-question-taxonomy.repository.ts`
- `backend/database/src/queries/drizzle-question-taxonomy.query.ts`
- `backend/api/src/questions/**`
- `frontend/web/src/pages/question-taxonomy-settings/**`
- `frontend/web/src/app/routes/_authenticated.admin._enrolled.question-settings*.tsx`
- 위 파일들의 바로 대응하는 `*.test.ts`, `*.test.tsx`, `*.spec.ts`

기존 흐름과 연결하기 위해 이 브랜치가 외과적으로 수정할 파일:

- `shared/contracts/src/admin/content-imports.ts`
- `shared/contracts/src/admin/questions.ts`
- `backend/database/src/schema/questions.schema.ts`
- `backend/database/src/repositories/drizzle-content-draft.repository.ts`
- `backend/database/src/repositories/drizzle-question-admin.repository.ts`
- `backend/database/src/queries/drizzle-admin-question.query.ts`
- `backend/domain/src/content-import/content-draft*.ts`
- `backend/domain/src/questions/question-admin*.ts`
- `frontend/web/src/pages/admin-question-detail/model/questionVersionJsonFormSchema.ts`
- `frontend/web/src/pages/admin-question-detail/ui/QuestionVersionJsonForm.tsx`

통합 담당만 수정할 공유 파일:

- `shared/contracts/src/index.ts`
- `backend/api/src/app.module.ts`
- `frontend/web/src/app/routing/adminNavigation.ts`
- `frontend/web/src/app/routing/redirectSearch.ts`
- `frontend/web/src/app/routing/routeReachability.test.ts`
- `frontend/web/src/app/routes/__root.tsx`
- `frontend/web/src/routeTree.gen.ts`
- `backend/database/seed/local.sql`
- `backend/database/drizzle/**`

금지 경로:

- 다른 Wave 4 작업이 소유하는 vocabulary, AI provider, worker 구현 파일
- 기존 migration 파일 수정
- 제품 설계 문서 변경
- 관련 없는 formatter/refactor/의존성 업그레이드

---

### Task 1: Taxonomy 계약과 불변식 고정

**Files:**

- Create: `shared/contracts/src/questions/question-taxonomy-settings.ts`
- Test: `shared/contracts/src/questions/question-taxonomy-settings.test.ts`

- [ ] 실패 테스트에 다음을 고정한다.
  - 7대 분류와 대분류별 허용 기본 템플릿/선택지 수
  - `QuestionTypeVersionStatus = DRAFT | ACTIVE | RETIRED`
  - 1~5 정수 key와 비어 있지 않은 한국어 문구를 모두 요구하는 난이도 기준
  - 유형 생성, 새 버전 생성, 승인 예시 등록, 활성화, 주제·태그 생성/보관 요청 schema
  - `AdminQuestionVersionPayload`를 재사용하는 승인 예시 snapshot
  - 설정 전체 조회 응답: 세부 유형/버전/기준/예시/주제/태그

- [ ] Red:

```bash
pnpm vitest run shared/contracts/src/questions/question-taxonomy-settings.test.ts
```

Expected: 모듈 또는 export가 없어 실패.

- [ ] 최소 Zod schema와 inferred type만 구현한다. 7대 분류의 한국어 라벨과 skill은 한 상수 map에서 파생하고 중복 정의하지 않는다.

- [ ] Green:

```bash
pnpm vitest run shared/contracts/src/questions/question-taxonomy-settings.test.ts
```

Expected: 잘못된 대분류, 3/4 이외 optionCount, 빠진 난이도 단계, 구조가 맞지 않는 승인 예시를 거부하며 통과.

### Task 2: PostgreSQL schema와 참조 보존

**Files:**

- Modify: `backend/database/src/schema/questions.schema.ts`
- Modify: `backend/database/src/schema/questions.schema.spec.ts`

- [ ] 실패 schema 테스트에 다음 구조를 명시한다.
  - `question_major_category`, `question_type_version_status`, `taxonomy_status` enum
  - `question_types.major_category`
  - `question_type_versions.status`
  - `question_type_versions.difficulty_criteria` JSONB
  - `question_type_approved_examples(id, type_version_id, title, payload, payload_hash, created_at)`
  - `question_topics(id, slug, display_name, status, timestamps)`
  - `question_tags(id, slug, display_name, status, timestamps)`
  - `question_versions.topic_id`
  - `question_version_tags(question_version_id, tag_id)`
  - 유형별 한 개 ACTIVE를 보장하는 partial unique index
  - 기존 및 신규 FK의 `RESTRICT`

- [ ] Red:

```bash
pnpm vitest run backend/database/src/schema/questions.schema.spec.ts
```

Expected: 신규 enum/table/column/index가 없어 실패.

- [ ] Drizzle schema를 구현한다. 예시 `payload_hash`는 canonical JSON의 SHA-256 hex이고 `(type_version_id, payload_hash)`를 unique로 둔다.

- [ ] Green:

```bash
pnpm vitest run backend/database/src/schema/questions.schema.spec.ts
pnpm --filter @flex-thia/database typecheck
```

Expected: schema 테스트와 database typecheck 통과.

### Task 3: Domain lifecycle과 초기 버전 순환 해소

**Files:**

- Create: `backend/domain/src/questions/question-taxonomy.ts`
- Create: `backend/domain/src/questions/question-taxonomy.repository.ts`
- Create: `backend/domain/src/questions/question-taxonomy.service.ts`
- Test: `backend/domain/src/questions/question-taxonomy.service.spec.ts`

- [ ] fake repository를 쓰는 실패 테스트를 먼저 작성한다.
  - 세부 유형 생성 시 v1 DRAFT를 한 트랜잭션 경계에서 만든다.
  - DRAFT에만 기준과 예시를 추가/교체할 수 있다.
  - 예시 snapshot은 템플릿/optionCount/정답 하나 규칙을 통과해야 한다.
  - 1~5 난이도 기준과 승인 예시가 없으면 활성화가 실패한다.
  - 활성화 시 기존 ACTIVE를 RETIRED로 바꾸고 새 버전을 ACTIVE로 만든다.
  - ACTIVE/RETIRED의 내용 변경 및 참조 중인 버전 삭제를 허용하지 않는다.
  - 동일 payload hash 예시, topic/tag slug 중복을 거부한다.
  - archived topic/tag는 새 문제 선택 목록에서 제외한다.

- [ ] Red:

```bash
pnpm vitest run backend/domain/src/questions/question-taxonomy.service.spec.ts
```

Expected: service/repository port가 없어 실패.

- [ ] 서비스와 repository port를 구현한다. 예시 검증은 기존 `validateQuestionVersion`의 구조 규칙을 공유하되 DB의 media/vocabulary 존재 검사는 요구하지 않는다. 활성화 transaction method를 repository port 하나로 노출한다.

- [ ] Green:

```bash
pnpm vitest run backend/domain/src/questions/question-taxonomy.service.spec.ts
pnpm --filter @flex-thia/domain typecheck
```

Expected: lifecycle 전이와 순환 해소 테스트 통과.

### Task 4: Database repository와 ACTIVE 선택 규칙

**Files:**

- Create: `backend/database/src/repositories/drizzle-question-taxonomy.repository.ts`
- Create: `backend/database/src/queries/drizzle-question-taxonomy.query.ts`
- Test: `backend/database/src/repositories/drizzle-question-taxonomy.repository.spec.ts`
- Test: `backend/database/src/queries/drizzle-question-taxonomy.query.spec.ts`
- Modify: `backend/database/src/repositories/drizzle-content-draft.repository.ts`
- Modify: `backend/database/src/repositories/drizzle-question-admin.repository.ts`
- Modify matching repository specs.

- [ ] mock Drizzle adapter 기반 실패 테스트를 작성한다.
  - 설정 조회가 유형→버전→기준/예시를 안정된 순서로 조립한다.
  - 활성화가 한 transaction에서 이전 ACTIVE retire와 새 ACTIVE 전환을 수행한다.
  - 일반 question type lookup은 ACTIVE만 반환한다.
  - 기존 question graph 조회는 RETIRED 참조도 반환한다.
  - archived topic/tag는 새 버전 저장 시 거부한다.

- [ ] Red:

```bash
pnpm vitest run \
  backend/database/src/repositories/drizzle-question-taxonomy.repository.spec.ts \
  backend/database/src/queries/drizzle-question-taxonomy.query.spec.ts \
  backend/database/src/repositories/drizzle-content-draft.repository.spec.ts \
  backend/database/src/repositories/drizzle-question-admin.repository.spec.ts
```

Expected: 신규 adapter가 없고 기존 lookup이 status를 보지 않아 실패.

- [ ] query/repository를 구현하고 기존 두 repository의 type lookup에 `ACTIVE` 조건을 추가한다. 과거 graph 조회 쿼리에는 상태 필터를 추가하지 않는다.

- [ ] Green:

```bash
pnpm vitest run \
  backend/database/src/repositories/drizzle-question-taxonomy.repository.spec.ts \
  backend/database/src/queries/drizzle-question-taxonomy.query.spec.ts \
  backend/database/src/repositories/drizzle-content-draft.repository.spec.ts \
  backend/database/src/repositories/drizzle-question-admin.repository.spec.ts
pnpm --filter @flex-thia/database typecheck
```

Expected: repository 테스트와 typecheck 통과.

### Task 5: 문제 버전에 topic/tag 연결

**Files:**

- Modify: `shared/contracts/src/admin/content-imports.ts`
- Modify: `shared/contracts/src/admin/questions.ts`
- Modify: matching contract tests
- Modify: `backend/domain/src/content-import/content-draft.ts`
- Modify: `backend/domain/src/content-import/content-draft.repository.ts`
- Modify: `backend/domain/src/content-import/content-draft.service.spec.ts`
- Modify: `backend/domain/src/questions/question-admin.ts`
- Modify: `backend/domain/src/questions/question-admin.repository.ts`
- Modify: `backend/domain/src/questions/question-admin.spec.ts`
- Modify: `backend/database/src/queries/drizzle-admin-question.query.ts`
- Modify: matching query tests

- [ ] 실패 테스트로 canonical/admin payload의 `topicSlug`, `tagSlugs` parsing과 저장을 고정한다. parser 입력 default는 `general`/`[]`, domain command는 필수 normalized 값이어야 한다.

- [ ] Red:

```bash
pnpm vitest run \
  shared/contracts/src/admin/content-imports.test.ts \
  shared/contracts/src/admin/questions.test.ts \
  backend/domain/src/content-import/content-draft.service.spec.ts \
  backend/domain/src/questions/question-admin.spec.ts
```

Expected: taxonomy 필드가 누락되고 저장 호출이 없어 실패.

- [ ] content import와 관리자 replace가 topic을 resolve하고 question version + tag join을 같은 transaction에 저장하도록 최소 수정한다. clone은 원본 version의 topic/tag 참조를 그대로 복사한다.

- [ ] admin detail query에 topic과 tag를 포함한다.

- [ ] Green:

```bash
pnpm vitest run \
  shared/contracts/src/admin/content-imports.test.ts \
  shared/contracts/src/admin/questions.test.ts \
  backend/domain/src/content-import/content-draft.service.spec.ts \
  backend/domain/src/questions/question-admin.spec.ts \
  backend/database/src/queries/drizzle-admin-question.query.spec.ts
```

Expected: 기본값 호환, 명시 분류 저장, clone 보존 테스트 통과.

### Task 6: 관리자 taxonomy API

**Files:**

- Create: `backend/api/src/questions/question-taxonomy.dto.ts`
- Create: `backend/api/src/questions/admin-question-taxonomy.controller.ts`
- Create: `backend/api/src/questions/question-taxonomy.module.ts`
- Test: `backend/api/src/questions/admin-question-taxonomy.controller.spec.ts`

- [ ] 다음 endpoint의 인증·validation·service delegation 실패 테스트를 작성한다.
  - `GET /api/v1/admin/question-taxonomy`
  - `POST /api/v1/admin/question-types`
  - `POST /api/v1/admin/question-types/:questionTypeId/versions`
  - `PUT /api/v1/admin/question-type-versions/:versionId/difficulty-criteria`
  - `POST /api/v1/admin/question-type-versions/:versionId/examples`
  - `DELETE /api/v1/admin/question-type-versions/:versionId/examples/:exampleId`
  - `POST /api/v1/admin/question-type-versions/:versionId/activate`
  - `POST /api/v1/admin/question-type-versions/:versionId/retire`
  - `POST /api/v1/admin/question-topics`, `POST /api/v1/admin/question-tags`
  - `POST /api/v1/admin/question-topics/:id/archive`, `POST /api/v1/admin/question-tags/:id/archive`

- [ ] Red:

```bash
pnpm vitest run backend/api/src/questions/admin-question-taxonomy.controller.spec.ts
```

Expected: controller/module이 없어 실패.

- [ ] controller는 request parsing과 응답 mapping만 담당하고 lifecycle 판단은 domain service에 둔다. 기존 관리자 guard/decorator를 재사용한다.

- [ ] Green:

```bash
pnpm vitest run backend/api/src/questions/admin-question-taxonomy.controller.spec.ts
pnpm --filter @flex-thia/api typecheck
```

Expected: 관리자 권한, 잘못된 ID/body 400, lifecycle conflict 409 mapping까지 통과.

### Task 7: 관리자 설정 UI와 문제 편집 분류 입력

**Files:**

- Create: `frontend/web/src/pages/question-taxonomy-settings/api/questionTaxonomyQueries.ts`
- Create: `frontend/web/src/pages/question-taxonomy-settings/model/questionTaxonomyFormSchema.ts`
- Create: `frontend/web/src/pages/question-taxonomy-settings/ui/QuestionTaxonomySettingsPageContainer.tsx`
- Create: `frontend/web/src/pages/question-taxonomy-settings/ui/QuestionTaxonomySettingsPageView.tsx`
- Create: `frontend/web/src/pages/question-taxonomy-settings/index.ts`
- Test: `frontend/web/src/pages/question-taxonomy-settings/ui/QuestionTaxonomySettingsPage.test.tsx`
- Create: `frontend/web/src/app/routes/_authenticated.admin._enrolled.question-settings.tsx`
- Modify: `frontend/web/src/pages/admin-question-detail/model/questionVersionJsonFormSchema.ts`
- Modify: `frontend/web/src/pages/admin-question-detail/ui/QuestionVersionJsonForm.tsx`
- Modify matching tests.

- [ ] component 실패 테스트에 다음 사용자 흐름을 고정한다.
  - 7대 분류별 세부 유형과 버전 상태를 조회한다.
  - 유형/vNext DRAFT를 만들고 템플릿, 3/4 선택지 수, 규칙을 입력한다.
  - 난이도 1~5 기준과 canonical 승인 예시를 입력한다.
  - 준비 조건이 부족하면 활성화 버튼과 사유가 표시된다.
  - 활성화 확인 후 이전 버전은 RETIRED로 보인다.
  - topic/tag를 생성·보관한다.
  - 기존 문제 JSON 편집기는 topic/tag를 전송한다.

- [ ] Red:

```bash
pnpm --filter @flex-thia/web test -- \
  src/pages/question-taxonomy-settings/ui/QuestionTaxonomySettingsPage.test.tsx \
  src/pages/admin-question-detail/ui/QuestionVersionReplacePage.test.tsx
```

Expected: 설정 page와 분류 입력이 없어 실패.

- [ ] 기존 UI primitive와 query client를 재사용하여 단일 설정 화면을 구현한다. 복잡한 범용 form abstraction을 만들지 않는다. 예시 입력은 기존 문제 JSON form schema를 재사용한다.

- [ ] Green:

```bash
pnpm --filter @flex-thia/web test -- \
  src/pages/question-taxonomy-settings/ui/QuestionTaxonomySettingsPage.test.tsx \
  src/pages/admin-question-detail/ui/QuestionVersionReplacePage.test.tsx
pnpm --filter @flex-thia/web typecheck
```

Expected: 설정 lifecycle과 문제 분류 입력 component 테스트 통과.

### Task 8: 기존 seed backfill과 migration

**Files:**

- Modify: `backend/database/seed/local.sql`
- Modify: `backend/database/src/commands/local-seed.spec.ts`
- Integration create: `backend/database/drizzle/<generated>_question_taxonomy_settings.sql`

- [ ] seed 실패 테스트에 다음 기대를 추가한다.
  - 기존 ID `00000000-0000-4000-8000-000000000311`을 그대로 보존한다.
  - `reading-vocabulary`를 `READING_VOCABULARY_GRAMMAR`, ACTIVE v1로 backfill한다.
  - v1에 난이도 1~5 기준과 승인 예시 snapshot 1개가 있다.
  - topic `general`이 있고 기존 네 question version이 이를 참조한다.
  - 기존 네 question version의 `type_version_id`와 상태는 바뀌지 않는다.
  - 나머지 여섯 대분류의 기본 세부 유형 v1은 DRAFT로 seed한다. 승인 예시 없이 ACTIVE로 우회하지 않는다.

- [ ] Red:

```bash
pnpm vitest run backend/database/src/commands/local-seed.spec.ts
```

Expected: taxonomy seed가 없어 실패.

- [ ] 통합 담당이 local seed를 수정한다. legacy 승인 예시는 published version `00000000-0000-4000-8000-000000000411`의 현재 내용을 canonical snapshot으로 명시하여 삽입한다.

- [ ] Green:

```bash
pnpm vitest run backend/database/src/commands/local-seed.spec.ts
```

Expected: 고정 ID 및 참조 보존 assertion 통과.

- [ ] 통합 담당이 schema에서 migration을 생성한다. 생성된 SQL을 직접 검토하여 다음 순서를 보장한다.
  1. nullable 신규 column/table/enum 생성
  2. `general` topic과 legacy category/status/criteria/example backfill
  3. 기존 question version topic backfill
  4. NOT NULL/check/index/FK 적용
  5. 기존 type/version/question version ID를 update하지 않음

- [ ] Migration static check:

```bash
pnpm --filter @flex-thia/database db:generate
git diff --check
```

Expected: 새 migration 한 개만 생성되고 whitespace 오류 없음.

### Task 9: 통합 담당 wiring과 생성 파일

**Files:**

- Modify: `shared/contracts/src/index.ts`
- Modify: `backend/api/src/app.module.ts`
- Modify: `frontend/web/src/app/routing/adminNavigation.ts`
- Modify: `frontend/web/src/app/routing/redirectSearch.ts`
- Modify: `frontend/web/src/app/routing/routeReachability.test.ts`
- Modify: `frontend/web/src/app/routes/__root.tsx`
- Generate: `frontend/web/src/routeTree.gen.ts`

- [ ] contracts barrel export와 Nest module import를 추가한다.
- [ ] 관리자 navigation, redirect allowlist, breadcrumb title, route reachability를 `/admin/question-settings`에 연결한다.
- [ ] 라우트 생성은 기존 frontend dev/build generator로 수행하며 `routeTree.gen.ts`를 수동 편집하지 않는다.

- [ ] Focused integration verification:

```bash
pnpm vitest run \
  backend/api/src/questions/admin-question-taxonomy.controller.spec.ts \
  frontend/web/src/app/routing/routeReachability.test.ts \
  frontend/web/src/pages/question-taxonomy-settings/ui/QuestionTaxonomySettingsPage.test.tsx
```

Expected: API module과 관리자 route가 실제 root에서 도달 가능.

### Task 10: 실제 PostgreSQL, 전체 gate, 수동 PG 검증

- [ ] Docker 사용 전 불필요 산출물을 정리한다.

```bash
rm -rf backend/*/dist frontend/web/dist
pnpm exec vitest --clearCache
docker compose down --remove-orphans
```

Expected: 소스와 dependency store는 보존되고 build/test 산출물 및 중지된 컨테이너만 정리됨.

- [ ] PostgreSQL만 올리고 migration/seed를 검증한다.

```bash
docker compose up -d postgres
LOCAL_DATABASE_RESET=true DATABASE_URL=postgres://flex_thia:local_only_password@localhost:5432/flex_thia \
  pnpm --filter @flex-thia/database db:reset-seed:local
```

Expected: PostgreSQL healthy, migration과 seed 성공.

- [ ] 실제 PG에서 불변식과 backfill을 확인한다.

```bash
docker compose exec -T postgres psql -U flex_thia -d flex_thia -v ON_ERROR_STOP=1 -c "
select qt.slug, qt.major_category, qtv.version, qtv.status
from question_types qt
join question_type_versions qtv on qtv.question_type_id = qt.id
order by qt.slug, qtv.version;
select qv.id, qv.type_version_id, t.slug as topic_slug
from question_versions qv
join question_topics t on t.id = qv.topic_id
order by qv.id;
"
```

Expected: legacy v1 ID/참조가 유지되고 `reading-vocabulary`는 ACTIVE, 여섯 기본 유형은 DRAFT, 기존 네 버전 topic은 `general`.

- [ ] API만 필요한 동안 foreground 또는 별도 터미널에서 실행하고 controller 수준 smoke를 한다. 포트 3000을 다른 작업이 쓰는지 먼저 확인한다.

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
docker compose --profile frontend-dev up -d db-setup api
curl -fsS http://localhost:3000/ready
curl -fsS http://localhost:3000/api/v1/admin/question-taxonomy
```

Expected: 포트 충돌 없음, readiness 200, fake admin 설정 조회 200. 포트가 점유되어 있으면 점유 프로세스를 임의 종료하지 말고 API smoke만 보류한다.

- [ ] API smoke 직후 app container를 내리고 PostgreSQL은 다음 검증까지만 유지한다.

```bash
docker compose stop api
docker compose rm -f api db-setup
```

Expected: 3000 포트와 app 메모리 반환, postgres만 실행.

- [ ] 전체 정적/단위 gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Expected: 모두 exit 0. 실패 시 `superpowers:systematic-debugging`으로 원인을 고치고 이 다섯 명령을 처음부터 다시 실행한다.

- [ ] 실제 PG 검증이 끝나면 Docker와 build cache를 즉시 정리한다.

```bash
docker compose down --remove-orphans
rm -rf backend/*/dist frontend/web/dist
pnpm exec vitest --clearCache
docker compose ps
```

Expected: 실행 중인 project container가 없고 소스·migration·`node_modules`·pnpm store는 보존됨.

- [ ] 최종 diff에서 이 계획의 소유 파일과 통합 파일 외 변경이 없는지 확인한다.

```bash
git status --short
git diff --stat
git diff --check
```

Expected: 관련 파일만 변경되고 생성 cache/산출물은 없음.

## Completion Criteria

- 관리자 설정 화면에서 7대 분류, 세부 유형, DRAFT/ACTIVE/RETIRED 버전, 1~5 난이도 기준, 승인 예시, topic/tag를 관리할 수 있다.
- 새 유형 v1은 DRAFT와 독립 snapshot 예시로 bootstrap되며 예시 없는 활성화 우회가 없다.
- 새 문제 작성은 ACTIVE 유형과 ACTIVE topic/tag만 선택하고, 기존 문제는 RETIRED 유형 버전과 원래 topic/tag를 계속 조회한다.
- legacy seed의 type version/question version ID와 참조가 유지된다.
- 단위/component 테스트, lint, typecheck, build, 실제 PostgreSQL migration/seed, 관리자 API smoke가 통과한다.
- 검증 종료 후 Docker와 재생성 가능한 build/test cache가 내려가고 삭제되어 있다.
