# Backend MVP Stage 5 콘텐츠 가져오기·관리자 API 구현 계획

> **실행 규칙:** 이 계획의 Task는 `superpowers:subagent-driven-development`로
> 하나씩 순차 실행한다. 각 Task는 새 구현 에이전트가 TDD, 검증, 자체 검토,
> 커밋까지 수행하고 별도 리뷰 에이전트가 명세와 품질을 검토한다.

**Goal:** 준비된 음성을 검증해 불변 media asset으로 만들고, 정규 JSON의
어휘·문제를 항목별 독립 transaction으로 초안 저장하며, ADMIN이 가져오기
결과와 모든 콘텐츠 상태를 조회·교체·검증·게시·숨김·복구할 수 있는 MVP
관리자 API를 완성한다.

**Architecture:** `shared/contracts/src/admin`은 strict 요청·응답 Zod 계약을
소유한다. `backend/domain/src/media`, `content-import`, `questions`,
`vocabulary`는 업로드·가져오기·관리 수명 규칙과 transaction port를
소유한다. `backend/database`는 content import schema, 항목별 draft writer,
관리자 command repository와 read query를 구현한다. `backend/providers`는
기존 입력 자료 업로드와 분리된 audio storage adapter를 제공한다.
`backend/api/src/admin`은 ACTIVE ADMIN, TOTP, 공개 DTO, Swagger/OpenAPI
경계를 조립한다.

**Tech Stack:** TypeScript, Vitest, Zod, NestJS, Drizzle ORM, PostgreSQL 16,
AWS S3, Swagger/OpenAPI

---

## 확정된 Stage 5 경계

- 기준 HEAD는 `178d909`이다. Stage 2의 `mediaAssets`, vocabulary·sentence
  schema, Stage 3의 `QuestionPublicationService`와 audit transaction,
  Stage 4의 strict public response/error filter를 그대로 확장한다.
- 기존 `/uploads`, `/jobs`, PDF·AI·TTS queue는 보류 상태를 유지하고
  root module에 다시 연결하지 않는다. audio upload는 별도 port·provider와
  `media_assets`를 사용한다.
- 모든 route는 `CognitoAuthorizerGuard`, `ApplicationRoleGuard`,
  `AdminMfaGuard`, `@RequireRole('ADMIN')`로 ACTIVE ADMIN과 TOTP 등록을
  요구한다. access token 기반 관리자 쓰기에는 refresh-cookie CSRF guard를
  추가하지 않는다.
- 관리자 변경은 성공한 DB transaction 안에서 구조화 audit row와 함께
  commit한다. 예상 검증·상태 오류는 error log로 남기지 않고 원본 JSON,
  storage key, token, S3 상세를 공개 응답이나 로그에 넣지 않는다.
- audio는 `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/webm`,
  `audio/mp4`와 1 byte~25 MiB를 허용한다. 서버가 정한
  `audio/{mediaAssetId}` key만 presign하고 완료 시 실제 MIME·크기·SHA-256을
  다시 계산한다. `READY` row는 수정하지 않으며 exact hash/size/MIME이
  같은 READY asset은 재사용 응답을 낼 수 있다.
- import request는 strict `schemaVersion: 1`, UUID `Idempotency-Key`,
  vocabulary+question 합계 1~100개다. 전체 body schema 실패는 저장 전
  400이다.
- `content_imports.status`는 처리 중 `NULL`, 완료 뒤
  `COMPLETED | COMPLETED_WITH_FAILURES`만 저장한다. 같은 사용자/key와
  같은 canonical request hash는 완료 결과를 재사용하거나 미완료 항목을
  재개하고, 다른 hash는 `CONTENT_IMPORT_IDEMPOTENCY_CONFLICT`다.
- vocabulary 항목을 원본 순서대로 먼저 처리하고 question 항목을 뒤에
  처리한다. 각 항목의 draft graph, `content_import_items`, audit은 하나의
  transaction이다. 예상 가능한 항목 오류만 `REJECTED`로 기록하고 다음
  항목을 계속한다.
- import vocabulary의 meaning과 pronunciation은 승인된 입력에 별도 mapping
  필드가 없으므로 해당 vocabulary 안에서 all-to-all mapping을 만든다.
  question token의 vocabulary/meaning/pronunciation client ref는 같은
  vocabulary 항목의 성공 결과에서만 해석한다.
- question import는 성공한 같은-request vocabulary 또는 기존 ID를
  참조할 수 있다. sentence media는 READY여야 하고 question type
  slug/version이 실제 등록돼야 한다. 생성 결과는 question과 version 1
  `DRAFT`이며 가져오기는 게시를 뜻하지 않는다.
- 관리자 question version PUT은 `DRAFT`만 전체 교체한다. published,
  retired, invalidated version은 `IMMUTABLE_VERSION` 409다. 교체된 초안은
  validation 상태를 `PENDING`으로 되돌린다.
- 새 question version은 current published version이 있으면 그것을, 없으면
  최신 version을 복사해 다음 번호의 `DRAFT`를 만든다. sentence version은
  불변 참조로 재사용한다.
- 관리자 vocabulary PUT은 참조를 깨뜨리지 않도록 `DRAFT`이고 기존
  meaning/pronunciation이 question token에서 사용되지 않을 때만 전체
  교체한다. exact normalized duplicate와 사용 중 교체는 409다.
- 모든 공개 operation은 request·response schema, Bearer, ADMIN/MFA,
  성공 status, 적용 가능한 400/401/403/404/409/413/429/500
  `application/problem+json` Swagger metadata와 operation별 OpenAPI
  document 테스트를 가진다.
- 브라우저·API E2E, infra/CDK, branch/worktree/PR은 만들지 않는다.

---

### Task 1: 관리자 공개 Zod 계약

**Files:**

- Create: `shared/contracts/src/admin/content-imports.ts`
- Create: `shared/contracts/src/admin/content-imports.spec.ts`
- Create: `shared/contracts/src/admin/media-assets.ts`
- Create: `shared/contracts/src/admin/media-assets.spec.ts`
- Create: `shared/contracts/src/admin/questions.ts`
- Create: `shared/contracts/src/admin/questions.spec.ts`
- Create: `shared/contracts/src/admin/vocabularies.ts`
- Create: `shared/contracts/src/admin/vocabularies.spec.ts`
- Create: `shared/contracts/src/admin/index.ts`
- Modify: `shared/contracts/src/index.ts`

**Produces:**

- canonical `refSchema`는 `id`와 `clientRef` 중 정확히 하나만 허용한다.
- sentence/token/expression, vocabulary item, question item schema는 모든
  object를 strict로 검증한다.
- import request는 `schemaVersion === 1`, item 합계 1~100을 검증한다.
- `Idempotency-Key`, UUID path, page/pageSize query schema를 제공한다.
- import summary/detail은 item kind, source index, IMPORTED/REJECTED,
  target ID와 `{path, code}[]`만 공개한다.
- audio request/response는 filename/MIME/declared bytes/SHA-256,
  upload-required 또는 READY-reused branch, media status·usage를 제공하되
  storage key는 제외한다.
- admin question list/detail/version payload/validation report와 vocabulary
  list/detail/replace payload를 제공한다.

- [ ] **Step 1: canonical JSON과 strict validation RED를 작성한다**

정상 최소 payload, exact-one ref, offset/range, option client ref와
correctOptionRef, duplicate client ref, item 수 0/101, unknown key,
schemaVersion 오류를 테스트한다. 모든 `describe`, `it`, `test` 설명은
한국어로 작성한다.

Run:

```bash
pnpm exec vitest run shared/contracts/src/admin
```

Expected: FAIL with missing modules

- [ ] **Step 2: 공개 응답 비노출 RED와 schema를 구현한다**

response schema가 `storageKey`, DB row, request hash, item reference map,
option `isCorrect` 같은 내부 필드를 strict하게 거절하는지 고정한다.
공통 canonical sentence schema는 실제 import와 admin question payload가
공유하는 범위에서만 export한다.

- [ ] **Step 3: contracts 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/contracts test
pnpm --filter @flex-thia/contracts typecheck
pnpm lint
git diff --check
git add shared/contracts/src
git commit -m "feat: define admin content contracts"
```

---

### Task 2: 콘텐츠 가져오기 schema와 additive migration

**Files:**

- Create: `backend/database/src/schema/content-import.schema.ts`
- Create: `backend/database/src/schema/content-import.schema.spec.ts`
- Modify: `backend/database/src/schema/index.ts`
- Create: `backend/database/drizzle/0006_admin-content.sql`
- Create: `backend/database/drizzle/meta/0006_snapshot.json`
- Modify: `backend/database/drizzle/meta/_journal.json`

**Tables:**

```text
content_imports
  id, requested_by, idempotency_key, request_hash,
  status nullable, vocabulary_count, question_count,
  imported_count, rejected_count, created_at, completed_at

content_import_items
  id, import_id, kind, source_index, client_ref,
  status, target_id nullable, errors jsonb, reference_map jsonb, created_at
```

- [ ] **Step 1: exact schema metadata RED를 작성한다**

- `(requested_by,idempotency_key)` UNIQUE
- `content_import_items(import_id,kind,source_index)` UNIQUE
- requester/import FK는 RESTRICT
- status enum은 final 두 값만 가지며 import status/completedAt consistency
- item kind `VOCABULARY | QUESTION`, status `IMPORTED | REJECTED`
- source index nonnegative, counts nonnegative, total count 1~100
- IMPORTED는 target ID와 빈 errors, REJECTED는 null target과 하나 이상 error
- internal `referenceMap`은 public contract에 노출되지 않음

Run:

```bash
pnpm exec vitest run backend/database/src/schema/content-import.schema.spec.ts
```

Expected: FAIL with missing exports

- [ ] **Step 2: schema와 Drizzle-generated migration을 구현한다**

기존 `0000`~`0005`를 수정하지 않는다. Drizzle Kit으로 `0006`을 생성하고
DROP/DELETE/TRUNCATE가 없으며 enum, FK, UNIQUE, CHECK, journal 순서가
일치하는지 확인한다.

- [ ] **Step 3: clean PostgreSQL 16 catalog 검증과 커밋을 수행한다**

`0000`~`0006` 전체를 임시 PostgreSQL 16에 적용해 exact metadata와
중복 idempotency/item 실패를 확인한다.

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/database/src/schema backend/database/drizzle
git commit -m "feat: add content import schema"
```

---

### Task 3: audio media upload 수명·S3 adapter·persistence

**Files:**

- Create: `backend/domain/src/media/media-admin.repository.ts`
- Create: `backend/domain/src/media/media-admin.service.ts`
- Create: `backend/domain/src/media/media-admin.service.spec.ts`
- Modify: `backend/domain/src/media/media-asset.ts`
- Modify: `backend/domain/src/index.ts`
- Create: `backend/providers/src/storage/audio-upload.provider.ts`
- Create: `backend/providers/src/storage/audio-upload.provider.spec.ts`
- Create: `backend/providers/src/fakes/fake-audio-upload.provider.ts`
- Modify: `backend/providers/src/fakes/index.ts`
- Modify: `backend/providers/src/index.ts`
- Create: `backend/database/src/repositories/drizzle-media-admin.repository.ts`
- Create: `backend/database/src/repositories/drizzle-media-admin.repository.spec.ts`
- Create: `backend/database/src/queries/drizzle-admin-media.query.ts`
- Create: `backend/database/src/queries/drizzle-admin-media.query.spec.ts`
- Modify: `backend/database/src/index.ts`

- [ ] **Step 1: upload request와 완료 RED를 작성한다**

다음을 domain tests로 고정한다.

- 빈/초과 size, 허용되지 않은 MIME, 비정상 SHA-256을 provider 호출 전 거절
- 서버 생성 UUID와 `audio/{id}` exact key만 presign
- exact READY hash/size/MIME asset 재사용은 새 row/object를 만들지 않음
- UPLOADING 완료는 actual inspection이 모두 일치할 때만 READY
- mismatch는 REJECTED와 audit을 commit한 뒤 안정 오류
- READY 재완료는 idempotent하며 update하지 않음
- create/complete 변경과 audit이 같은 transaction

- [ ] **Step 2: 분리된 S3 audio adapter를 TDD로 구현한다**

presigned POST는 exact key, MIME, 1~25 MiB, 10분 expiry를 policy에 강제한다.
완료 inspection은 HeadObject의 ContentLength/ContentType과 GetObject
전체 bytes의 SHA-256을 비교한다. AWS 오류 message, bucket/key는 domain
밖으로 노출하지 않는다. fake는 deterministic upload form과 설정된
inspection만 반환한다.

- [ ] **Step 3: Drizzle transaction과 usage query를 구현한다**

media row를 `FOR UPDATE`로 잠그고 조건부 terminal transition과 audit을 같은
transaction에 둔다. READY row update path가 없음을 테스트한다. GET detail
query는 pronunciation/sentence usage ID와 count를 반환하고 storage key는
API projection 전용 내부 값으로도 반환하지 않는다.

- [ ] **Step 4: 전체 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/providers test
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/domain typecheck
pnpm --filter @flex-thia/providers typecheck
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/domain/src backend/providers/src backend/database/src
git commit -m "feat: manage audio media assets"
```

---

### Task 4: canonical draft domain과 항목 transaction port

**Files:**

- Create: `backend/domain/src/content-import/content-draft.repository.ts`
- Create: `backend/domain/src/content-import/content-draft.ts`
- Create: `backend/domain/src/content-import/content-draft.spec.ts`
- Create: `backend/domain/src/content-import/content-import.ts`
- Modify: `backend/domain/src/index.ts`

**Produces:**

```ts
export class ContentDraftService {
  createVocabularyItem(command: CreateVocabularyDraftCommand): Promise<...>;
  createQuestionItem(command: CreateQuestionDraftCommand): Promise<...>;
}

export class ContentDraftError extends Error {
  readonly code:
    | 'IMPORT_REFERENCE_NOT_FOUND'
    | 'IMPORT_REFERENCE_MISMATCH'
    | 'IMPORT_MEDIA_NOT_READY'
    | 'IMPORT_QUESTION_TYPE_NOT_FOUND'
    | 'IMPORT_DUPLICATE_VOCABULARY'
    | 'IMPORT_CONTENT_INVALID';
}
```

- [ ] **Step 1: vocabulary item RED를 작성한다**

`createVocabularyDraft` normalization을 재사용하고, media asset 존재,
meaning/pronunciation client ref uniqueness, all-to-all relation, 반환
reference map, draft graph+item+audit transaction을 검증한다.

- [ ] **Step 2: question item RED를 작성한다**

같은 import의 성공 vocabulary reference map과 기존 UUID ref를 해석한다.
meaning/pronunciation이 token vocabulary 소유인지, expression vocabulary가
EXPRESSION인지, offsets와 token ranges가 기존 Thai content validator를
통과하는지, sentence media가 READY인지, question type slug/version이
존재하는지 검증한다. 결과는 question/version 1 DRAFT와 item+audit 하나의
transaction이다.

- [ ] **Step 3: 최소 transaction port와 service를 구현한다**

domain은 UUID 생성과 참조 해석/검증/안정 오류를 소유하고, adapter에는
current row 조회와 resolved graph insert만 맡긴다. client ref,
`referenceMap`은 관리자 공개 응답 타입으로 export하지 않는다.

- [ ] **Step 4: domain 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/domain typecheck
pnpm lint
git diff --check
git add backend/domain/src/content-import backend/domain/src/index.ts
git commit -m "feat: define canonical content drafts"
```

---

### Task 5: Drizzle canonical draft writer

**Files:**

- Create: `backend/database/src/repositories/drizzle-content-draft.repository.ts`
- Create: `backend/database/src/repositories/drizzle-content-draft.repository.spec.ts`
- Modify: `backend/database/src/index.ts`

- [ ] **Step 1: resolved vocabulary graph RED를 작성한다**

한 transaction에서 vocabulary, meanings, pronunciations, all-to-all relation,
IMPORTED item, audit을 삽입한다. normalized duplicate, missing media,
item unique conflict는 안정적인 persistence result로 변환하고 partial row를
남기지 않는다.

- [ ] **Step 2: resolved question graph RED를 작성한다**

question/type/media/vocabulary/meaning/pronunciation current state를 같은
transaction에서 확인하고 question, version, sentence/version,
token/expression, block/link/option, import item, audit을 원자 저장한다.
정답은 `correctOptionRef`로 정확히 한 option에만 설정한다.

- [ ] **Step 3: PostgreSQL 16 atomicity와 FK를 검증한다**

- vocabulary draft 성공 뒤 reference map 재조회
- question이 같은 import의 성공 vocabulary를 참조해 DRAFT 생성
- 실패한 ref/media/type은 해당 draft graph 0 row와 REJECTED 기록 경로
- concurrent same item은 draft graph 하나와 item 하나
- 다른 vocabulary의 meaning/pronunciation 교차 참조 실패

- [ ] **Step 4: database 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/database typecheck
pnpm --filter @flex-thia/domain test
pnpm lint
git diff --check
git add backend/database/src
git commit -m "feat: persist canonical content drafts"
```

---

### Task 6: 동기식 content import orchestration과 조회

**Files:**

- Create: `backend/domain/src/content-import/content-import.repository.ts`
- Create: `backend/domain/src/content-import/content-import.service.ts`
- Create: `backend/domain/src/content-import/content-import.service.spec.ts`
- Modify: `backend/domain/src/index.ts`
- Create: `backend/database/src/repositories/drizzle-content-import.repository.ts`
- Create: `backend/database/src/repositories/drizzle-content-import.repository.spec.ts`
- Create: `backend/database/src/queries/drizzle-content-import.query.ts`
- Create: `backend/database/src/queries/drizzle-content-import.query.spec.ts`
- Modify: `backend/database/src/index.ts`

- [ ] **Step 1: idempotency와 item ordering RED를 작성한다**

canonical request hash를 계산해 같은 user/key/same hash는 완료 결과를
재사용하고 미완료 item만 재개한다. 다른 hash는 409용 stable error다.
vocabulary를 source index 순으로 모두 처리한 뒤 question을 처리한다.

- [ ] **Step 2: partial failure RED를 작성한다**

예상 `ContentDraftError`는 `{path,code}`와 REJECTED item으로 별도
transaction 저장하고 다음 항목을 계속한다. question의 failed client ref는
해당 question만 거절한다. unexpected DB/provider error는 항목 오류로
위장하지 않고 request를 실패시킨다.

- [ ] **Step 3: completion·replay·query를 구현한다**

모든 unique item row를 기준으로 imported/rejected count와 final status를
조건부 갱신하고 completion audit을 같은 transaction에 둔다. 목록과 상세는
ADMIN user 범위가 아니라 전체 운영 이력을 page 순서로 반환하되 requester
ID, hash/referenceMap, 원본 JSON은 공개 projection에서 제외한다.

- [ ] **Step 4: PostgreSQL concurrency와 커밋을 수행한다**

동일 idempotency request 동시 호출이 import row/item/draft를 중복하지
않고, different payload가 기존 결과를 바꾸지 않는지 확인한다.

```bash
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/domain typecheck
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/domain/src backend/database/src
git commit -m "feat: process content imports synchronously"
```

---

### Task 7: 관리자 문제 관리 application·query·transaction

**Files:**

- Modify: `backend/domain/src/questions/question-publication.repository.ts`
- Modify: `backend/domain/src/questions/question-publication.ts`
- Modify: `backend/domain/src/questions/question-publication.spec.ts`
- Create: `backend/domain/src/questions/question-admin.repository.ts`
- Create: `backend/domain/src/questions/question-admin.ts`
- Create: `backend/domain/src/questions/question-admin.spec.ts`
- Modify: `backend/domain/src/index.ts`
- Create: `backend/database/src/repositories/drizzle-question-admin.repository.ts`
- Create: `backend/database/src/repositories/drizzle-question-admin.repository.spec.ts`
- Create: `backend/database/src/queries/drizzle-admin-question.query.ts`
- Create: `backend/database/src/queries/drizzle-admin-question.query.spec.ts`
- Modify: `backend/database/src/index.ts`

- [ ] **Step 1: clone·replace RED를 작성한다**

- question row lock 뒤 current published 또는 latest version deep-copy
- version number max+1, DRAFT/PENDING, sentence version refs 재사용
- DRAFT PUT만 old block/option links를 교체하고 새 sentence graphs를 생성
- immutable status는 `IMMUTABLE_VERSION`
- replace 뒤 validation report 초기화
- 각 성공 변경과 audit 같은 transaction

- [ ] **Step 2: publication service audit 계약을 보강한다**

validate도 actor/request/occurredAt command를 받아 validation 저장과 audit을
같은 transaction에 둔다. publish는 최신 검증을 계속 다시 수행한다.
invalidate/hide/restore의 기존 Stage 3 동시성·audit 테스트를 보존한다.

- [ ] **Step 3: 모든 상태 read query를 구현한다**

page list와 detail은 DRAFT/PUBLISHED/HIDDEN question, 모든 version status,
type/version, validation report, block/option 정답, sentence ref를 관리자
계약에 맞게 반환한다. stable order와 count를 테스트한다.

- [ ] **Step 4: PostgreSQL transaction과 커밋을 수행한다**

clone concurrency, immutable replace, validation FAILED 200용 report,
publish/retire, invalidate/hide, audit atomicity를 실제 DB로 검증한다.

```bash
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/domain typecheck
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/domain/src backend/database/src
git commit -m "feat: manage question drafts"
```

---

### Task 8: 관리자 어휘 관리 application·query·transaction

**Files:**

- Create: `backend/domain/src/vocabulary/vocabulary-admin.repository.ts`
- Create: `backend/domain/src/vocabulary/vocabulary-admin.ts`
- Create: `backend/domain/src/vocabulary/vocabulary-admin.spec.ts`
- Modify: `backend/domain/src/vocabulary/vocabulary.ts`
- Modify: `backend/domain/src/index.ts`
- Create: `backend/database/src/repositories/drizzle-vocabulary-admin.repository.ts`
- Create: `backend/database/src/repositories/drizzle-vocabulary-admin.repository.spec.ts`
- Create: `backend/database/src/queries/drizzle-admin-vocabulary.query.ts`
- Create: `backend/database/src/queries/drizzle-admin-vocabulary.query.spec.ts`
- Modify: `backend/database/src/index.ts`

- [ ] **Step 1: replace·publish·visibility RED를 작성한다**

- DRAFT와 child rows를 잠그고 미사용일 때만 전체 교체
- normalized Thai exact duplicate는 `VOCABULARY_DUPLICATE`
- question token/expression이 참조 중이면 `VOCABULARY_IN_USE`
- 발음 1개 이상과 모든 media READY일 때만 publish
- PUBLISHED→HIDDEN→PUBLISHED exact transitions
- 변경과 audit 같은 transaction, 실패에는 audit 없음

- [ ] **Step 2: all-status list/detail query를 구현한다**

detail은 meanings, pronunciations, meaning-pronunciation mapping, sentence와
question version usage를 stable order로 반환한다. private storage key와
원문 전체 import payload는 projection에서 제외한다.

- [ ] **Step 3: PostgreSQL FK·동시성과 커밋을 수행한다**

replace/publish/hide/restore와 동시 save의 row lock 순서, exact duplicate,
referenced child replace 차단, audit rollback을 검증한다.

```bash
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/domain typecheck
pnpm --filter @flex-thia/database typecheck
pnpm lint
git diff --check
git add backend/domain/src backend/database/src
git commit -m "feat: manage vocabularies"
```

---

### Task 9: Admin HTTP module·Swagger/OpenAPI·root 조립

**Files:**

- Create: `backend/api/src/admin/admin-content.service.ts`
- Create: `backend/api/src/admin/admin-content.service.spec.ts`
- Create: `backend/api/src/admin/admin-content-imports.controller.ts`
- Create: `backend/api/src/admin/admin-content-imports.controller.spec.ts`
- Create: `backend/api/src/admin/admin-media-assets.controller.ts`
- Create: `backend/api/src/admin/admin-media-assets.controller.spec.ts`
- Create: `backend/api/src/admin/admin-questions.controller.ts`
- Create: `backend/api/src/admin/admin-questions.controller.spec.ts`
- Create: `backend/api/src/admin/admin-vocabularies.controller.ts`
- Create: `backend/api/src/admin/admin-vocabularies.controller.spec.ts`
- Create: `backend/api/src/admin/admin.module.ts`
- Create: `backend/api/src/admin/admin.module.spec.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.ts`
- Modify: `backend/api/src/common/errors/domain-exception.filter.spec.ts`
- Modify: `backend/api/src/openapi/openapi.dto.ts`
- Modify: `backend/api/src/openapi/openapi.spec.ts`
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/app.module.spec.ts`
- Modify: `backend/config/src/api-env.ts`
- Modify: `backend/config/src/api-env.spec.ts`

**Routes:**

```text
POST /admin/content-imports
GET  /admin/content-imports
GET  /admin/content-imports/{importId}

POST /admin/media-assets/audio-upload-requests
POST /admin/media-assets/{mediaAssetId}/complete
GET  /admin/media-assets/{mediaAssetId}

GET  /admin/questions
GET  /admin/questions/{questionId}
POST /admin/questions/{questionId}/versions
PUT  /admin/question-versions/{versionId}
POST /admin/question-versions/{versionId}/validate
POST /admin/question-versions/{versionId}/publish
POST /admin/question-versions/{versionId}/invalidate
POST /admin/questions/{questionId}/hide
POST /admin/questions/{questionId}/restore

GET  /admin/vocabularies
GET  /admin/vocabularies/{vocabularyId}
PUT  /admin/vocabularies/{vocabularyId}
POST /admin/vocabularies/{vocabularyId}/publish
POST /admin/vocabularies/{vocabularyId}/hide
POST /admin/vocabularies/{vocabularyId}/restore
```

- [ ] **Step 1: service/controller RED를 작성한다**

모든 path/query/header/body를 contracts Zod로 parse하고 userId/requestId를
명령에 전달한다. response는 strict schema로 재검증하며 내부 storage key,
hash/referenceMap, correct flag 누출을 generic 500으로 바꾼다. validation
FAILED는 200, 생성은 201, 명령 no-body는 204를 사용한다.

- [ ] **Step 2: ADMIN/MFA guard와 오류 매핑을 고정한다**

21개 operation 모두 Bearer+ADMIN+MFA를 요구한다. domain error를
400/404/409/413으로 안정 매핑하고 import 429와 모든 500을 문서화한다.
예상 오류는 error log가 없고 unexpected 오류만 requestId/route/userId
안전 로그를 남긴다.

- [ ] **Step 3: operation expectation table OpenAPI 테스트를 작성한다**

각 operation의 method/path, path/query/header/body, success status/ref 또는
204 no-body, Bearer security, exact error status 집합,
`application/problem+json`을 전부 검증한다. DTO component에 private/internal
field가 없음을 document JSON으로 확인한다.

- [ ] **Step 4: 환경별 root DI를 구현한다**

`MEDIA_BUCKET_NAME`을 production 필수 config로 추가한다. production은
S3 audio provider, local/test는 fake audio provider를 사용한다. 같은 DB
instance의 import/media/question/vocabulary repository·query와 기존
QuestionPublicationService를 `AdminModule`에 조립한다. Identity, Learning,
health는 유지하고 legacy Jobs/UploadsModule은 등록하지 않는다. infra/CDK는
수정하지 않는다.

- [ ] **Step 5: 전체 검증과 커밋을 수행한다**

```bash
pnpm --filter @flex-thia/api test
pnpm --filter @flex-thia/contracts test
pnpm --filter @flex-thia/domain test
pnpm --filter @flex-thia/database test
pnpm --filter @flex-thia/providers test
pnpm structure:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git add backend/api/src backend/config/src
git commit -m "feat: expose admin content api"
```

---

## Stage 5 완료 검증

- [ ] Task 1~9 각각 구현 commit과 별도 명세/품질 review가 있다.
- [ ] 각 Task의 Critical/Important review finding은 수정 commit 뒤
  재review PASS다.
- [ ] whole-stage `계획 commit..HEAD` review에서 Critical/Important가 없다.
- [ ] clean PostgreSQL 16에 `0000`~`0006` migration을 적용하고 import item
  atomicity, idempotency, admin state transition을 검증한다.
- [ ] 21개 관리자 operation의 요청·응답·인증·오류 Swagger와 OpenAPI
  document 테스트가 통과한다.
- [ ] `pnpm structure:check`, changed-file Prettier, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`가 fresh
  상태에서 통과한다.
- [ ] 작업 트리는 clean이고 관련 commit이 현재 branch에 있다.
