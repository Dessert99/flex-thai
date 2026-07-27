# Wave 5 Automated TTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 필수 태국어 음성을 비동기 생성하고 동일 음성을 재사용하며, 부분 실패·일괄/개별 재시도와 게시 준비 상태를 보존하는 TTS backend를 완성한다.

**Architecture:** media domain 아래 TTS job/item/cache와 provider/storage port를 추가하고, deterministic fake provider로 worker pipeline을 검증한다. 콘텐츠 target 연결은 generic attachment port로 격리하고, 실제 runtime DI·migration·게시 서비스 조립은 통합 브랜치가 담당한다. production provider가 없으면 외부 호출 없이 명시적 unavailable 결과를 저장한다.

**Tech Stack:** TypeScript 6, NestJS 11, Zod, Drizzle ORM, PostgreSQL 16, Vitest

## Global Constraints

- 코드 기준선은 local `main`의 `e98cba6`이며 승인 설계 `54d25e8`을 포함한 공통 계획 commit에서 branch를 만든다.
- `docs/superpowers/specs/2026-07-27-wave5-parallel-delivery-design.md`를 기능 요구의 단일 기준으로 사용한다.
- 새 파일·수정 export는 `conventions/comment-convention.md`를 따른다.
- 테스트 설명은 한국어로 작성하고 E2E를 추가하지 않는다.
- 신규 package, 외부 network, credential, 유료 TTS 호출을 추가하지 않는다.
- READY media asset은 변경하지 않는다.
- item 하나의 실패가 다른 item의 성공을 rollback하지 않는다.
- retry는 명시적 command만 attempt를 증가시킨다.
- 공용 barrel, AppModule, OpenAPI, infra, migration, root package는 수정하지 않는다.

---

## Ownership

**Create/modify:**

- `backend/domain/src/media/tts-job.ts`
- `backend/domain/src/media/tts-job.spec.ts`
- `backend/domain/src/media/tts-provider.ts`
- `backend/database/src/schema/tts.schema.ts`
- `backend/database/src/schema/tts.schema.spec.ts`
- `backend/database/src/repositories/tts/drizzle-tts.repository.ts`
- `backend/database/src/repositories/tts/drizzle-tts.repository.spec.ts`
- `backend/database/src/queries/drizzle-tts-operations.query.ts`
- `backend/database/src/queries/drizzle-tts-operations.query.spec.ts`
- `backend/providers/src/fakes/deterministic-tts.provider.ts`
- `backend/providers/src/fakes/deterministic-tts.provider.spec.ts`
- `backend/providers/src/fakes/fake-tts-audio.store.ts`
- `backend/providers/src/fakes/fake-tts-audio.store.spec.ts`
- `backend/worker/src/media/tts-processor.ts`
- `backend/worker/src/media/tts-processor.spec.ts`
- `shared/contracts/src/media/tts-operations.ts`
- `shared/contracts/src/media/tts-operations.spec.ts`
- `backend/api/src/media/tts-operations.dto.ts`
- `backend/api/src/media/tts-operations.service.ts`
- `backend/api/src/media/tts-operations.service.spec.ts`
- `backend/api/src/media/tts-operations.controller.ts`
- `backend/api/src/media/tts-operations.controller.spec.ts`
- feature-local media `index.ts` only

**Do not modify:**

- `backend/database/src/schema/index.ts`
- workspace root barrels
- `backend/database/drizzle/**`
- `backend/domain/src/content-production/**`
- `backend/worker/src/content-production/**`
- `backend/api/src/app.module.ts`
- `backend/api/src/openapi/**`
- `infra/**`
- `frontend/**`
- every package manifest and lockfile

## Fixed interfaces

```ts
type TtsTargetKind =
  | 'VOCABULARY_PRONUNCIATION'
  | 'EXPRESSION'
  | 'THAI_SENTENCE_VERSION'
  | 'CONCEPT_SENTENCE';
type TtsItemStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
type TtsJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIALLY_FAILED'
  | 'FAILED';

interface TtsTargetSnapshot {
  kind: TtsTargetKind;
  targetId: string;
  text: string;
  required: boolean;
  revision: string;
}

interface TtsVoiceSnapshot {
  presetId: string;
  provider: string;
  model: string;
  voice: string;
  locale: 'th-TH';
  audioFormat: 'audio/wav';
  generationRevision: string;
}

interface TtsProviderResult {
  bytes: Uint8Array;
  mimeType: 'audio/wav';
  usage: Record<string, number>;
  estimatedCostUsd: string;
  providerRequestId: string | null;
}

interface CreateTtsJobInput {
  requestedBy: string;
  targets: TtsTargetSnapshot[];
  voice: TtsVoiceSnapshot;
  requestedAt: Date;
}

interface TtsWorkItem {
  jobId: string;
  itemId: string;
  attempt: number;
  leaseToken: string;
  leaseUntil: Date;
  target: TtsTargetSnapshot;
  voice: TtsVoiceSnapshot;
  cacheKey: string;
}

interface TtsSuccessInput {
  item: TtsWorkItem;
  mediaAssetId: string;
  claimToken: string;
  completedAt: Date;
}

interface TtsFailureInput {
  item: TtsWorkItem;
  errorCode: string;
  retryable: boolean;
  failedAt: Date;
}

interface RetryTtsItemsInput {
  jobId: string;
  itemIds: string[];
  expectedAttempts: Record<string, number>;
  requestedAt: Date;
}

interface TtsJob {
  id: string;
  status: TtsJobStatus;
  requestedBy: string;
  counts: {
    pending: number;
    processing: number;
    succeeded: number;
    failed: number;
  };
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

interface TtsJobListInput {
  status?: TtsJobStatus;
  page: number;
  pageSize: number;
}

interface TtsItemListInput {
  jobId: string;
  status?: TtsItemStatus;
  page: number;
  pageSize: number;
}

interface TtsJobPage {
  items: TtsJob[];
  page: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

interface TtsJobDetail extends TtsJob {
  voice: TtsVoiceSnapshot;
}

interface TtsItemPage {
  items: Array<{
    id: string;
    target: TtsTargetSnapshot;
    status: TtsItemStatus;
    attempt: number;
    errorCode: string | null;
    retryable: boolean;
    mediaAssetId: string | null;
  }>;
  page: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
```

### Task 1: TTS job and item domain

**Files:**

- Create: `backend/domain/src/media/tts-job.ts`
- Test: `backend/domain/src/media/tts-job.spec.ts`
- Create: `backend/domain/src/media/tts-provider.ts`

**Interfaces:**

- Produces:

```ts
interface TtsProvider {
  synthesize(input: {
    text: string;
    voice: TtsVoiceSnapshot;
    signal: AbortSignal;
  }): Promise<TtsProviderResult>;
}
interface TtsAudioStore {
  put(input: {
    cacheKey: string;
    bytes: Uint8Array;
    mimeType: 'audio/wav';
    sha256: string;
  }): Promise<{ storageKey: string }>;
}
interface TtsTargetAttachmentRepository {
  attach(input: {
    target: TtsTargetSnapshot;
    mediaAssetId: string;
    expectedRevision: string;
  }): Promise<'ATTACHED' | 'STALE_TARGET'>;
}
```

- [ ] **Step 1: Write failing transition tests**

  PENDING→PROCESSING→SUCCEEDED/FAILED, stale lease, terminal 재전이 거절,
  retryable FAILED→PENDING 새 attempt와 job aggregate를 검증한다.

- [ ] **Step 2: Write cache-key tests**

  NFKC+trim+공백 정규화 text, voice snapshot, provider/model/format/revision의
  SHA-256이 같을 때만 같은 key인지 검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/domain/src/media/tts-job.spec.ts`

- [ ] **Step 4: Implement pure domain**

  `claimTtsItem`, `completeTtsItem`, `failTtsItem`, `retryTtsItems`,
  `aggregateTtsJobStatus`, `createTtsCacheKey`를 구현한다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/domain/src/media/tts-job.spec.ts && pnpm --filter @flex-thia/domain typecheck`

  Commit:
  `git commit -m "feat(media): define TTS job lifecycle"`

### Task 2: TTS persistence schema

**Files:**

- Create: `backend/database/src/schema/tts.schema.ts`
- Test: `backend/database/src/schema/tts.schema.spec.ts`

**Interfaces:**

- Produces: `ttsVoicePresets`, `ttsJobs`, `ttsItems`, `ttsAudioCache`

- [ ] **Step 1: Write failing schema tests**

  다음 invariant를 고정한다.

  ```ts
  expect(unique(cache, ['cacheKey'])).toBe(true);
  expect(unique(item, ['jobId', 'targetKind', 'targetId', 'revision'])).toBe(
    true,
  );
  expect(item.columns.attempt.notNull).toBe(true);
  expect(item.columns.leaseToken.notNull).toBe(false);
  ```

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/schema/tts.schema.spec.ts`

- [ ] **Step 3: Implement schema**

  job에는 requester, status, counts, created/started/finished timestamps를 둔다.
  item에는 target/text/voice snapshot, status, attempt/lease, error/retryable,
  media asset와 timestamps를 둔다. cache에는 digest, media asset과 ready
  metadata revision을 둔다.

- [ ] **Step 4: Verify and commit**

  Run:
  `pnpm exec vitest run backend/database/src/schema/tts.schema.spec.ts && pnpm --filter @flex-thia/database typecheck`

  Commit:
  `git commit -m "feat(database): model automated TTS jobs"`

### Task 3: Atomic repository and reuse claim

**Files:**

- Create: `backend/database/src/repositories/tts/drizzle-tts.repository.ts`
- Test: `backend/database/src/repositories/tts/drizzle-tts.repository.spec.ts`

**Interfaces:**

- Produces:

```ts
interface TtsRepository {
  createJob(input: CreateTtsJobInput): Promise<TtsJob>;
  claimNext(jobId: string, now: Date): Promise<TtsWorkItem | null>;
  claimAudio(cacheKey: string): Promise<
    | { kind: 'GENERATE'; claimToken: string }
    | { kind: 'REUSE'; mediaAssetId: string }
    | { kind: 'OUTCOME_UNKNOWN' }
  >;
  succeed(input: TtsSuccessInput): Promise<boolean>;
  fail(input: TtsFailureInput): Promise<boolean>;
  retry(input: RetryTtsItemsInput): Promise<number>;
}
```

- [ ] **Step 1: Write failing repository tests**

  same cache key 동시 claim 한 개, READY replay, 남은 claim outcome unknown,
  stale item lease no-op, success transaction의 media/cache/item/attachment
  rollback을 검증한다.

- [ ] **Step 2: Add partial failure tests**

  한 item 실패 뒤 다른 PENDING item claim 가능, job `PARTIALLY_FAILED`,
  retryable selection만 attempt 증가를 검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/repositories/tts/drizzle-tts.repository.spec.ts`

- [ ] **Step 4: Implement repository**

  `FOR UPDATE SKIP LOCKED`에 대응하는 Drizzle transaction, unique cache claim,
  active lease 조건 update와 target attachment port 호출 계약을 구현한다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/database/src/repositories/tts/drizzle-tts.repository.spec.ts && pnpm --filter @flex-thia/database typecheck`

  Commit:
  `git commit -m "feat(database): persist TTS work atomically"`

### Task 4: Deterministic WAV provider and fake store

**Files:**

- Create: `backend/providers/src/fakes/deterministic-tts.provider.ts`
- Test: `backend/providers/src/fakes/deterministic-tts.provider.spec.ts`
- Create: `backend/providers/src/fakes/fake-tts-audio.store.ts`
- Test: `backend/providers/src/fakes/fake-tts-audio.store.spec.ts`

**Interfaces:**

- Implements: `TtsProvider`, `TtsAudioStore`

- [ ] **Step 1: Write failing WAV tests**

  deterministic bytes가 `RIFF`, `WAVE`, PCM header를 가지며 같은 text/voice에
  같은 SHA-256, 다른 입력에 다른 결과를 내는지 검증한다.

- [ ] **Step 2: Write provider failure fixtures**

  `[[timeout]]`, `[[retryable]]`, `[[terminal]]` text fixture가 각각 timeout,
  retryable, terminal error를 내도록 고정한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/providers/src/fakes/deterministic-tts.provider.spec.ts backend/providers/src/fakes/fake-tts-audio.store.spec.ts`

- [ ] **Step 4: Implement minimal PCM WAV**

  외부 package 없이 짧은 silence/tone WAV를 생성한다. store는 cache key별
  immutable byte snapshot과 predictable private storage key를 보존한다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/providers/src/fakes/deterministic-tts.provider.spec.ts backend/providers/src/fakes/fake-tts-audio.store.spec.ts && pnpm --filter @flex-thia/providers typecheck`

  Commit:
  `git commit -m "feat(providers): add deterministic local TTS"`

### Task 5: TTS processor

**Files:**

- Create: `backend/worker/src/media/tts-processor.ts`
- Test: `backend/worker/src/media/tts-processor.spec.ts`

**Interfaces:**

- Consumes: Tasks 1, 3, 4
- Produces:

```ts
class TtsProcessor {
  process(jobId: string, signal: AbortSignal): Promise<TtsJobStatus>;
}
```

- [ ] **Step 1: Write failing processor tests**

  cache reuse는 provider 0회, cache miss는 1회, timeout, terminal failure,
  stale target, abort와 부분 실패 후 계속 처리를 검증한다.

- [ ] **Step 2: Add concurrency tests**

  같은 key 두 item을 동시에 처리해 provider call 한 번과 media link 두 건을
  검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run backend/worker/src/media/tts-processor.spec.ts`

- [ ] **Step 4: Implement processor**

  claim item → cache claim/reuse → provider → SHA-256 → store → media/cache/item
  success 순서를 지키고 error code/retryable을 저장한다. production provider
  미구성 adapter는 `TTS_PROVIDER_UNAVAILABLE` terminal 결과를 반환한다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run backend/worker/src/media/tts-processor.spec.ts && pnpm --filter @flex-thia/worker typecheck`

  Commit:
  `git commit -m "feat(worker): process automated TTS jobs"`

### Task 6: TTS operations query

**Files:**

- Create: `backend/database/src/queries/drizzle-tts-operations.query.ts`
- Test: `backend/database/src/queries/drizzle-tts-operations.query.spec.ts`

**Interfaces:**

- Produces:

```ts
interface TtsOperationsQuery {
  listJobs(input: TtsJobListInput): Promise<TtsJobPage>;
  findJob(jobId: string): Promise<TtsJobDetail | null>;
  listItems(input: TtsItemListInput): Promise<TtsItemPage>;
}
```

- [ ] **Step 1: Write failing stable pagination tests**

  status/date filters, `createdAt DESC, id DESC`, item status/error filters,
  nullable media와 aggregate counts를 검증한다.

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run backend/database/src/queries/drizzle-tts-operations.query.spec.ts`

- [ ] **Step 3: Implement query**

  private storage key와 raw audio/provider response를 select하지 않는다.
  media replay URL은 기존 media service가 별도로 발급할 media asset ID만
  반환한다.

- [ ] **Step 4: Verify and commit**

  Run:
  `pnpm exec vitest run backend/database/src/queries/drizzle-tts-operations.query.spec.ts && pnpm --filter @flex-thia/database typecheck`

  Commit:
  `git commit -m "feat(database): query TTS operations"`

### Task 7: Strict contracts and NestJS API

**Files:**

- Create: `shared/contracts/src/media/tts-operations.ts`
- Test: `shared/contracts/src/media/tts-operations.spec.ts`
- Create: `backend/api/src/media/tts-operations.dto.ts`
- Create: `backend/api/src/media/tts-operations.service.ts`
- Test: `backend/api/src/media/tts-operations.service.spec.ts`
- Create: `backend/api/src/media/tts-operations.controller.ts`
- Test: `backend/api/src/media/tts-operations.controller.spec.ts`

**Interfaces:**

- Produces routes:
  `GET /admin/tts/jobs`,
  `GET /admin/tts/jobs/:jobId`,
  `POST /admin/tts/jobs/:jobId/retry`,
  `POST /admin/tts/items/:itemId/retry`

- [ ] **Step 1: Write failing contract tests**

  page/status/date, item selection max 100, UUID, retryable, aggregate count,
  unknown field rejection과 ISO datetime을 검증한다.

- [ ] **Step 2: Write failing API tests**

  ADMIN+MFA guard metadata, list/detail, batch retry 202, single retry 202,
  missing 404, non-retryable/stale conflict 409를 검증한다.

- [ ] **Step 3: Run Red**

  Run:
  `pnpm exec vitest run shared/contracts/src/media/tts-operations.spec.ts backend/api/src/media/tts-operations.service.spec.ts backend/api/src/media/tts-operations.controller.spec.ts`

- [ ] **Step 4: Implement contracts and leaf API**

  controller는 IDs와 stable error만 노출하고 private storage key, bytes,
  provider raw response를 반환하지 않는다.

- [ ] **Step 5: Verify and commit**

  Run:
  `pnpm exec vitest run shared/contracts/src/media/tts-operations.spec.ts backend/api/src/media/tts-operations.service.spec.ts backend/api/src/media/tts-operations.controller.spec.ts && pnpm --filter @flex-thia/contracts typecheck && pnpm --filter @flex-thia/api typecheck`

  Commit:
  `git commit -m "feat(api): add TTS operations"`

### Task 8: Publication readiness port

**Files:**

- Modify: `backend/domain/src/media/tts-job.ts`
- Test: `backend/domain/src/media/tts-job.spec.ts`

**Interfaces:**

- Produces:

```ts
interface ContentTtsReadinessRepository {
  listRequiredTargets(
    content: TtsPublishableContent,
  ): Promise<Array<{ targetId: string; mediaStatus: 'MISSING' | 'READY' | 'FAILED' }>>;
}
function assertContentTtsReady(
  targets: Awaited<ReturnType<ContentTtsReadinessRepository['listRequiredTargets']>>,
): void;
```

- [ ] **Step 1: Write failing readiness tests**

  읽기·듣기 모두 MISSING/FAILED/UPLOADING을
  `CONTENT_TTS_NOT_READY`로 막고 target ID 목록을 stable order로 제공하는지
  검증한다. 모두 READY면 통과한다.

- [ ] **Step 2: Run Red**

  Run:
  `pnpm exec vitest run backend/domain/src/media/tts-job.spec.ts`

- [ ] **Step 3: Implement pure readiness rule**

  기존 `QuestionPublicationService` 수정과 DB adapter는 통합 branch에 남긴다.

- [ ] **Step 4: Verify and commit**

  Run:
  `pnpm exec vitest run backend/domain/src/media/tts-job.spec.ts && pnpm --filter @flex-thia/domain typecheck`

  Commit:
  `git commit -m "feat(media): define TTS publish readiness"`

### Task 9: Branch-wide verification and cleanup

**Files:**

- Review every owned TTS file

- [ ] **Step 1: Run focused suite**

  Run:
  `pnpm exec vitest run backend/domain/src/media/tts-job.spec.ts backend/database/src/schema/tts.schema.spec.ts backend/database/src/repositories/tts/drizzle-tts.repository.spec.ts backend/database/src/queries/drizzle-tts-operations.query.spec.ts backend/providers/src/fakes/deterministic-tts.provider.spec.ts backend/providers/src/fakes/fake-tts-audio.store.spec.ts backend/worker/src/media/tts-processor.spec.ts shared/contracts/src/media/tts-operations.spec.ts backend/api/src/media/tts-operations.service.spec.ts backend/api/src/media/tts-operations.controller.spec.ts`

- [ ] **Step 2: Run quality gates**

  Run:
  `pnpm lint && pnpm --filter @flex-thia/domain typecheck && pnpm --filter @flex-thia/database typecheck && pnpm --filter @flex-thia/providers typecheck && pnpm --filter @flex-thia/worker typecheck && pnpm --filter @flex-thia/contracts typecheck && pnpm --filter @flex-thia/api typecheck`

- [ ] **Step 3: Check diff**

  Run:
  `git diff --check && git status --short`

  Expected: ownership 밖 변경, migration, dependency 변경이 없다.

- [ ] **Step 4: Clean artifacts**

  Remove only `dist`, `coverage`, `.vite`, `cdk.out`; preserve dependency caches
  and DB volume.

- [ ] **Step 5: Final commit if needed**

  `git commit -m "test(media): harden automated TTS"`
