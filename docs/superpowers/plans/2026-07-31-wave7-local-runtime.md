# Wave 7 Local Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 유료 provider 없이 FLEX THIA 전체 기능을 충돌 없는 host
port와 실제 local upload·media·candidate pipeline으로 수동 검증할 수 있게
한다.

**Architecture:** Compose 내부 port는 유지하고 host publish와 public origin만
변수화한다. Browser upload와 signed media는 API에 등록한 local-only
filesystem adapter를 사용하며, deterministic processor는 domain port와
database repository를 통해 실제 문제·어휘 후보를 저장한다.

**Tech Stack:** TypeScript, NestJS, PostgreSQL, Drizzle, Docker Compose,
Vitest, Node.js filesystem/crypto

## Global Constraints

- 기준 설계는 `docs/superpowers/specs/2026-07-31-wave7-full-product-hardening-design.md`다.
- 구현 기준 SHA는 세 계획 문서를 커밋한 뒤의 local `main`으로 고정한다.
- 외부 유료 AI·OCR·TTS provider, SDK와 network call을 추가하지 않는다.
- production provider 선택과 fail-closed 동작을 변경하지 않는다.
- 새 package와 E2E runner를 추가하지 않는다.
- `backend/api`는 `backend/worker/src`를 import하지 않는다.
- migration과 `shared/contracts`, `routeTree.gen.ts`는 이 branch에서 수정하지 않는다.
- 새 코드와 변경 코드는 comment/structure/backend convention을 따른다.
- 테스트 설명은 한국어로 작성한다.
- production code보다 실패하는 테스트를 먼저 작성하고 RED 원인을 확인한다.
- Docker 종료는 `down -v` 없이 수행하고 기존 다른 project container를 변경하지 않는다.
- 수동 수정은 `apply_patch`로 하고 정확한 build/cache 산출물만 제거한다.

---

### Task 1: 충돌 없는 Compose와 local runtime 명령

**Files:**

- Modify: `compose.yaml`
- Modify: `backend/config/src/api-env.ts`
- Modify: `backend/config/src/api-env.spec.ts`
- Modify: `backend/config/src/local-compose.spec.ts`
- Modify: `package.json`
- Create: `scripts/local-runtime.mjs`
- Create: `scripts/local-runtime.spec.mjs`

**Interfaces:**

- Consumes: Compose 내부 PostgreSQL `5432`, API `3000`, web `80`
- Produces: `local:fresh`, `local:preserve`, `local:stop` root scripts와
  `FLEX_THIA_LOCAL_PUBLIC_ORIGIN`

- [ ] **Step 1: runtime command RED test 작성**

`scripts/local-runtime.spec.mjs`에서 child process runner를 주입해 다음
literal argv를 검증한다.

```js
expect(recorded).toEqual([
  'docker',
  'compose',
  '--project-name',
  'flex-thia-local',
  '--profile',
  'test',
  'up',
  '--build',
]);
```

fresh는 reset profile을 포함하고, preserve는 `db-setup`을 시작하지 않으며,
stop은 `down`만 사용하고 `-v`를 절대 포함하지 않아야 한다.

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm exec vitest run scripts/local-runtime.spec.mjs backend/config/src/api-env.spec.ts backend/config/src/local-compose.spec.ts
```

Expected: 새 command와 env가 없어 FAIL.

- [ ] **Step 3: 최소 runtime script와 config 구현**

host mapping을 다음 exact default로 만든다.

```yaml
ports:
  - '${FLEX_THIA_POSTGRES_HOST_PORT:-55432}:5432'
```

API는 `53000:3000`, web은 `5173:80`의 같은 형식을 사용한다.
`FLEX_THIA_LOCAL_PUBLIC_ORIGIN` 기본값은 `http://localhost:5173`이며
browser-facing upload/media URL에만 사용한다.

- [ ] **Step 4: preserve profile 분리**

fresh는 `db-setup`을 수행하고 preserve는 existing schema/data를 유지한다.
서비스 정의를 복제하지 말고 profile 또는 명시 service selection으로
한 Compose 파일을 재사용한다.

- [ ] **Step 5: GREEN과 Compose render 확인**

Run:

```bash
pnpm exec vitest run scripts/local-runtime.spec.mjs backend/config/src/api-env.spec.ts backend/config/src/local-compose.spec.ts
docker compose --project-name flex-thia-local --profile test config
```

Expected: tests PASS, rendered host ports `55432`, `53000`, `5173`, 내부
database URL은 `postgres:5432`.

- [ ] **Step 6: task commit**

Commit:

```text
feat(local): add conflict-free runtime commands
```

### Task 2: Browser가 실제 사용하는 local filesystem upload

**Files:**

- Create: `backend/providers/src/storage/local-file-upload.provider.ts`
- Create: `backend/providers/src/storage/local-file-upload.provider.spec.ts`
- Modify: `backend/providers/src/index.ts`
- Create: `backend/api/src/media/local-upload.controller.ts`
- Create: `backend/api/src/media/local-upload.controller.spec.ts`
- Modify: `backend/api/src/media/media.module.ts`
- Modify: `backend/api/src/media/media.module.spec.ts`
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/app.module.spec.ts`
- Modify: `compose.yaml`

**Interfaces:**

- Implements: `UploadStorage`, `AudioUploadStorage`
- Produces: same-origin multipart POST policy, sealed filesystem inspection
- Consumes: `FLEX_THIA_LOCAL_PUBLIC_ORIGIN`, local upload directory, 32자
  이상의 local HMAC secret

- [ ] **Step 1: provider RED tests 작성**

실제 temporary directory를 사용해 다음 break를 각각 검증한다.

```ts
expect(policy.url).toMatch(
  /^http:\/\/localhost:5173\/api\/v1\/local-uploads\//u,
);
expect(await storage.inspectObject(storageKey)).toEqual({
  sizeBytes: bytes.byteLength,
  contentType: 'text/plain',
  detectedType: 'TEXT',
  encryptedPdf: false,
  pdfPageCount: null,
});
```

잘못된 key/content type, 만료 token, declared size 초과, path traversal,
SHA-256 불일치는 거절해야 한다.

- [ ] **Step 2: controller RED tests 작성**

local module에서만 controller가 등록되고 production module에는 없음을
검증한다. multipart file 성공은 저장 후 204, 모든 token/storage 오류는
stable 400/404 problem이며 filesystem path와 secret을 공개하지 않는다.

- [ ] **Step 3: RED 확인**

Run:

```bash
pnpm exec vitest run backend/providers/src/storage/local-file-upload.provider.spec.ts backend/api/src/media/local-upload.controller.spec.ts backend/api/src/media/media.module.spec.ts
```

Expected: adapter/controller가 없어 FAIL.

- [ ] **Step 4: 단일 local adapter 구현**

content input과 audio의 기존 policy field를 유지한다. token payload는
upload ID, exact storage key, MIME, maximum bytes, expiry를 HMAC으로
보호한다. 저장은 임시 파일 후 atomic rename하고 inspection은 실제
파일에서 계산한다.

- [ ] **Step 5: local-only API 조립**

`NODE_ENV !== 'production'`에서 두 fake upload provider를 새 adapter로
대체한다. production은 기존 S3 provider를 그대로 사용한다. 기존
frontend `FormData` POST 구현은 수정하지 않는다.

- [ ] **Step 6: GREEN과 regression 확인**

Run:

```bash
pnpm exec vitest run backend/providers/src/storage/local-file-upload.provider.spec.ts backend/api/src/media/local-upload.controller.spec.ts backend/api/src/media/media.module.spec.ts backend/api/src/app.module.spec.ts
pnpm --filter @flex-thia/providers typecheck
pnpm --filter @flex-thia/api typecheck
```

- [ ] **Step 7: task commit**

Commit:

```text
feat(local): persist browser uploads
```

### Task 3: READY seed media와 실제 WAV fixture

**Files:**

- Modify: `backend/database/seed/local.sql`
- Modify: `backend/database/src/commands/local-seed.spec.ts`
- Create: `backend/providers/src/commands/seed-local-media.ts`
- Create: `backend/providers/src/commands/seed-local-media.spec.ts`
- Modify: `backend/providers/package.json`
- Modify: `backend/providers/src/storage/local-file-media-read.provider.ts`
- Modify: `backend/providers/src/storage/local-file-media-read.provider.spec.ts`
- Modify: `compose.yaml`

**Interfaces:**

- Consumes: `LocalFileTtsAudioStore`, `resolveLocalTtsAudioDirectory`
- Produces: READY DB storage key마다 hash-addressed `.audio` container

- [ ] **Step 1: seed/media parity RED tests 작성**

SQL의 READY media row를 읽어 canonical pattern과 fixture manifest를
대조한다.

```ts
expect(readyStorageKeys).toEqual([
  'private/tts/runs/00000000-0000-4000-8000-000000000010.wav',
  'private/tts/runs/00000000-0000-4000-8000-000000000011.wav',
  'private/tts/runs/00000000-0000-4000-8000-000000000013.wav',
]);
```

fixture command 실행 뒤 각 key의 signed URL을 reader가 읽고
`audio/wav` bytes를 반환해야 한다. `UPLOADING` row는 fixture를 만들지
않는다.

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm exec vitest run backend/database/src/commands/local-seed.spec.ts backend/providers/src/commands/seed-local-media.spec.ts backend/providers/src/storage/local-file-media-read.provider.spec.ts
```

Expected: legacy key와 누락 fixture 때문에 FAIL.

- [ ] **Step 3: canonical SQL과 fixture command 구현**

세 READY row의 MIME, size, SHA-256, storage key를 deterministic WAV
bytes와 일치시킨다. command는 existing store container 형식을 재사용하고
같은 bytes로 반복 실행해도 결과가 같아야 한다.

- [ ] **Step 4: Compose fresh seed에 fixture 연결**

`db-setup`에 TTS volume을 mount하고 SQL reset/seed 성공 뒤 media fixture
command를 실행한다. DB seed 실패 시 fixture만 성공한 상태를 정상으로
간주하지 않는다.

- [ ] **Step 5: GREEN과 focused package check**

Run:

```bash
pnpm exec vitest run backend/database/src/commands/local-seed.spec.ts backend/providers/src/commands/seed-local-media.spec.ts backend/providers/src/storage/local-file-media-read.provider.spec.ts
pnpm --filter @flex-thia/database typecheck
pnpm --filter @flex-thia/providers typecheck
```

- [ ] **Step 6: task commit**

Commit:

```text
fix(local): seed readable media fixtures
```

### Task 4: Deterministic 문제·어휘 후보 pipeline

**Files:**

- Modify: `backend/providers/src/fakes/local-content-production.queue.ts`
- Modify: `backend/providers/src/fakes/local-content-production.queue.spec.ts`
- Modify: `backend/providers/src/fakes/deterministic-content-production.processor.ts`
- Modify: `backend/providers/src/fakes/deterministic-content-production.processor.spec.ts`
- Modify: `backend/api/src/app.module.ts`
- Modify: `backend/api/src/app.module.spec.ts`

**Interfaces:**

- Consumes: `ContentProductionWorkItem`, `ContentProductionRepository`,
  `VocabularyProductionArtifacts`, `QuestionProductionCandidateRepository`,
  `expandQuestionGenerationPlan`
- Produces: idempotent vocabulary/question candidate rows and existing TTS outbox
- Integrates: product branch가 공개할 candidate read/review API는 기존 DB rows만
  소비하며 이 branch의 private adapter를 import하지 않음

- [ ] **Step 1: item-plan RED tests 작성**

preset snapshot의 declared question plan을 exact count/order로 펼치고
vocabulary 목적은 input당 한 item을 만든다. `questionPlan`이 null로
소실되면 test가 실패해야 한다.

- [ ] **Step 2: artifact persistence RED tests 작성**

ordinal 0은 실제 vocabulary/question candidate artifact, ordinal 1은
`NEEDS_ATTENTION`, ordinal 2는 retryable failure를 만든다. 같은
job/item/attempt 재전달은 candidate row를 중복하지 않는다.

- [ ] **Step 3: RED 확인**

Run:

```bash
pnpm exec vitest run backend/providers/src/fakes/local-content-production.queue.spec.ts backend/providers/src/fakes/deterministic-content-production.processor.spec.ts backend/api/src/app.module.spec.ts
```

Expected: status-only `{ generated: true }` 결과와 null plan 때문에 FAIL.

- [ ] **Step 4: domain port 기반 processor 구현**

API가 worker source를 import하지 않게 providers의 local processor에
필요한 domain repository port를 constructor로 주입한다. vocabulary는
`VocabularyProductionArtifacts`, question은 기존 question candidate
persist port를 사용한다. production SQS/runtime 조립은 변경하지 않는다.

- [ ] **Step 5: API local assembly 구현**

기존 Drizzle lookup/context/candidate repository를 한 번 만들고 local
processor에 주입한다. `ContentProductionModule.register()`에 product branch가
추가할 option을 덮어쓰지 않게 조립 변경을 한 hunk로 제한한다.

- [ ] **Step 6: GREEN과 mutation 확인**

Run:

```bash
pnpm exec vitest run backend/providers/src/fakes/local-content-production.queue.spec.ts backend/providers/src/fakes/deterministic-content-production.processor.spec.ts backend/api/src/app.module.spec.ts
pnpm --filter @flex-thia/providers typecheck
pnpm --filter @flex-thia/api typecheck
```

processor의 artifact persist 호출을 제거하면 candidate test가 RED가 되는지
확인한 뒤 복원한다.

- [ ] **Step 7: task commit**

Commit:

```text
feat(local): materialize deterministic candidates
```

### Task 5: 실제 local manual-run 문서

**Files:**

- Create: `README.md`
- Modify: `scripts/local-runtime.spec.mjs`

**Interfaces:**

- Consumes: Tasks 1~4의 exact command, URL, 계정
- Produces: 프로젝트 root의 단일 local test runbook

- [ ] **Step 1: 문서가 소비하는 command contract test 보강**

runtime script의 `--help` output에 fresh/preserve/stop, reset warning,
project name이 나타나는 행동을 검증한다. Markdown 문구 자체를 grep하는
test는 만들지 않는다.

- [ ] **Step 2: README 작성**

다음을 현재 구현과 일치하게 기록한다.

```text
learner@hufs.ac.kr → 이메일 코드 123456
admin@hufs.ac.kr → 이메일 코드 123456 → TOTP 123456
```

web `5173`, API health/Swagger `53000`, fresh reset 경고, preserve/stop,
upload→candidate→draft→TTS→publish 수동 순서와 유료 provider 미사용을
포함한다.

- [ ] **Step 3: focused verification**

Run:

```bash
pnpm exec vitest run scripts/local-runtime.spec.mjs
pnpm exec prettier --check README.md scripts/local-runtime.mjs scripts/local-runtime.spec.mjs
git diff --check
```

- [ ] **Step 4: branch verification**

Run:

```bash
pnpm --filter @flex-thia/config typecheck
pnpm --filter @flex-thia/providers typecheck
pnpm --filter @flex-thia/api typecheck
pnpm exec vitest run backend/config/src backend/providers/src/storage backend/providers/src/fakes backend/api/src/media backend/api/src/app.module.spec.ts scripts/local-runtime.spec.mjs
```

- [ ] **Step 5: task commit**

Commit:

```text
docs(local): add full-stack test runbook
```
